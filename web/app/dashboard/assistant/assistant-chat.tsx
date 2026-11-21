"use client";

import { AlertTriangle, ArrowUp, Check, FileImage, LoaderCircle, Mic, MicOff, Paperclip, RotateCcw, Sparkles, X } from "lucide-react";
import { FormEvent, KeyboardEvent, useEffect, useRef, useState } from "react";
import { useOnboardingHandoff } from "@/app/settings/new-user/onboarding-handoff";
import Link from "next/link";
import { useRouter } from "next/navigation";

import { PaoweenStage } from "@/app/dashboard/paoween-stage";
import { assistantNavigationSchema, assistantPages, draftEditSchema, isBatchConfirmation, isDuplicateConfirmation, navigationHref, parseCategoryOptions, parseReplySuggestions, recordRequestSchema, type RecordRequest, type ConfirmationProposal, type TransactionProposal } from "@/lib/finance/assistant-actions";
import { buildAssistantHistory } from "@/lib/finance/assistant-history";
import { PocketSelect } from "@/app/dashboard/pockets/pocket-fields";
import { pocketLabel, type PocketOption } from "@/lib/finance/pocket";
import { transactionMatchKey } from "@/lib/finance/transaction-match";

type SavedTransaction = { transactionId: string; updatedAt: string; proposal: ConfirmationProposal };
type ProposalCard = {
  id: string;
  number: number;
  proposal: ConfirmationProposal;
  status: "pending" | "duplicate" | "saved" | "dismissed";
  categoryOptions?: string[];
  categoryNeedsChoice?: boolean;
  saved?: SavedTransaction;
  error?: string;
};
type ChatAttachment = { name: string; dataUrl: string; sizeBytes: number };
type ChatMessage = {
  role: "user" | "assistant";
  content: string;
  completed?: boolean;
  attachments?: ChatAttachment[];
  context?: { year: string; month: string; transactionCount: number; taxRecordCount: number; taxLookupPerformed: boolean } | null;
  proposals?: ProposalCard[];
  recordRequest?: RecordRequest;
  replySuggestions?: string[];
  duplicates?: TransactionProposal[];
  duplicateImagePositions?: number[];
};
export type AssistantChatProps = { ready: boolean; onboardingScope: string; pockets: PocketOption[]; home?: boolean; compact?: boolean; showMascot?: boolean; onClose?: () => void };
type Mood = "idle" | "listening" | "thinking" | "talking" | "done" | "error" | "comic";
type SpeechResult = { transcript: string };
type SpeechRecognitionLike = {
  lang: string;
  interimResults: boolean;
  maxAlternatives: number;
  onstart: (() => void) | null;
  onresult: ((event: { results: ArrayLike<ArrayLike<SpeechResult>> }) => void) | null;
  onerror: ((event: { error: string }) => void) | null;
  onend: (() => void) | null;
  start: () => void;
  stop: () => void;
  abort: () => void;
};
type SpeechWindow = Window & { SpeechRecognition?: new () => SpeechRecognitionLike; webkitSpeechRecognition?: new () => SpeechRecognitionLike };

const maxSourceImageBytes = 12 * 1024 * 1024;
const maxInlineImageBytes = 480_000;
const maxAttachments = 5;
const supportedImageTypes = new Set(["image/jpeg", "image/png", "image/webp"]);

function readAsDataUrl(file: Blob) {
  return new Promise<string>((resolve, reject) => {
    const reader = new FileReader();
    reader.onerror = () => reject(new Error("อ่านภาพไม่สำเร็จ ลองเลือกไฟล์อีกครั้งนะ"));
    reader.onload = () => typeof reader.result === "string" ? resolve(reader.result) : reject(new Error("อ่านภาพไม่สำเร็จ ลองเลือกไฟล์อีกครั้งนะ"));
    reader.readAsDataURL(file);
  });
}

function canvasToJpeg(canvas: HTMLCanvasElement, quality: number) {
  return new Promise<Blob | null>((resolve) => canvas.toBlob(resolve, "image/jpeg", quality));
}

async function prepareAttachment(file: File): Promise<ChatAttachment> {
  if (!supportedImageTypes.has(file.type)) throw new Error("รองรับภาพ JPG, PNG หรือ WebP เท่านั้น");
  if (file.size > maxSourceImageBytes) throw new Error("เลือกภาพที่มีขนาดไม่เกิน 12 MB");

  let image: Blob = file;
  if (file.size > maxInlineImageBytes) {
    let bitmap: ImageBitmap;
    try {
      bitmap = await createImageBitmap(file);
    } catch {
      throw new Error("เปิดภาพนี้ไม่ได้ ลองบันทึกเป็น JPG, PNG หรือ WebP แล้วเลือกใหม่");
    }
    try {
      const scale = Math.min(1, 2200 / Math.max(bitmap.width, bitmap.height));
      const canvas = document.createElement("canvas");
      canvas.width = Math.max(1, Math.round(bitmap.width * scale));
      canvas.height = Math.max(1, Math.round(bitmap.height * scale));
      const context = canvas.getContext("2d");
      if (!context) throw new Error("เตรียมภาพไม่สำเร็จ ลองอีกครั้งนะ");
      context.drawImage(bitmap, 0, 0, canvas.width, canvas.height);
      let compressed: Blob | null = null;
      for (const quality of [0.86, 0.78, 0.7]) {
        compressed = await canvasToJpeg(canvas, quality);
        if (compressed && compressed.size <= maxInlineImageBytes) break;
      }
      if ((!compressed || compressed.size > maxInlineImageBytes) && Math.max(canvas.width, canvas.height) > 1600) {
        canvas.width = Math.max(1, Math.round(bitmap.width * 1600 / Math.max(bitmap.width, bitmap.height)));
        canvas.height = Math.max(1, Math.round(bitmap.height * 1600 / Math.max(bitmap.width, bitmap.height)));
        context.drawImage(bitmap, 0, 0, canvas.width, canvas.height);
        compressed = await canvasToJpeg(canvas, 0.76);
      }
      if (!compressed || compressed.size > maxInlineImageBytes) throw new Error("ลดขนาดภาพไม่สำเร็จ ลองเลือกภาพที่เล็กลงนะ");
      image = compressed;
    } finally {
      bitmap.close();
    }
  }

  return { name: file.name, dataUrl: await readAsDataUrl(image), sizeBytes: image.size };
}

function scopeName(year: string, month: string) {
  if (month === "all") return year === "all" ? "ทุกปี" : `ทั้งปี ${Number(year) + 543}`;
  const monthLabel = new Intl.DateTimeFormat("th-TH", { month: "long", timeZone: "Asia/Bangkok" })
    .format(new Date(Date.UTC(2000, Number(month) - 1, 1)));
  return `${monthLabel} ${year === "all" ? "ทุกปี" : Number(year) + 543}`;
}

type NavigationTarget = { href: string; label: string; localOnly?: boolean };

function parseNavigationRequest(message: string): NavigationTarget | null {
  const normalized = message.toLocaleLowerCase("th-TH");
  const explicitNavigation = /พา.{0,8}ไป|ไปที่(?:หน้า|เมนู)?|ไปหน้า|เปิด(?:หน้า|เมนู)|แสดงหน้า|ขอดูหน้า|navigate(?:\s+to)?|take me to|open(?:\s+the)?|show me/i.test(normalized);
  if (!explicitNavigation) return null;

  if (/ภาษี|tax|ยื่นภาษี/.test(normalized)) return { href: "/dashboard/tax", label: "เตรียมภาษี" };
  if (/งานตรวจ|รอตรวจ|review|ตรวจรายการ/.test(normalized)) return { href: "/dashboard/review", label: "งานตรวจ" };
  if (/ลงทุน|investment|กองทุน|หุ้น|พอร์ต/.test(normalized)) return { href: "/dashboard/investment", label: "การลงทุน" };
  if (/รายจ่าย|ค่าใช้จ่าย|spending|expense/.test(normalized)) return { href: "/dashboard/spending", label: "รายจ่าย" };
  if (/รายการ|ธุรกรรม|transaction|ประวัติการเงิน/.test(normalized)) return { href: "/dashboard/transactions", label: "รายการ" };
  if (/ปฏิทิน|กำหนดจ่าย|bill calendar|calendar/.test(normalized)) return { href: "/dashboard/local-tools#calendar", label: "ปฏิทินบิล", localOnly: true };
  if (/ช้อป|shopping|ตัวช่วยเลือกซื้อ/.test(normalized)) return { href: "/dashboard/local-tools#shopping", label: "ตัวช่วยเลือกซื้อ", localOnly: true };
  if (/ตั้งค่า|settings|api key/.test(normalized)) return { href: "/dashboard/settings", label: "ตั้งค่า" };
  if (/ภาพรวม|หน้าหลัก|หน้าแรก|dashboard|overview/.test(normalized)) return { href: "/dashboard", label: "ภาพรวม" };
  if (/ฟีเจอร์ในเครื่อง|local tools|เครื่องมือเฉพาะในเครื่อง/.test(normalized)) return { href: "/dashboard/local-tools", label: "ฟีเจอร์ที่อยู่ในเครื่อง", localOnly: true };
  return null;
}

export function AssistantChat({ ready, onboardingScope, pockets, home = false, compact = false, showMascot = true, onClose }: AssistantChatProps) {
  const router = useRouter();
  const onboardingHandoff = useOnboardingHandoff();
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [draft, setDraft] = useState("");
  const [attachments, setAttachments] = useState<ChatAttachment[]>([]);
  const [preparingAttachment, setPreparingAttachment] = useState(false);
  const [busy, setBusy] = useState(false);
  const [mood, setMood] = useState<Mood>("idle");
  const [error, setError] = useState("");
  const [voiceDialogOpen, setVoiceDialogOpen] = useState(false);
  const [voiceSupported, setVoiceSupported] = useState(false);
  const [listening, setListening] = useState(false);
  const [savingBatch, setSavingBatch] = useState(false);
  const logRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLTextAreaElement>(null);
  const attachmentInputRef = useRef<HTMLInputElement>(null);
  const idleTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const recognitionRef = useRef<SpeechRecognitionLike | null>(null);
  const busyRef = useRef(false);
  const expenseMoments = useRef(0);
  const proposalNumber = useRef(0);

  useEffect(() => {
    const pending = onboardingHandoff.take(onboardingScope, "slip");
    if (pending?.kind !== "slip") return;
    setPreparingAttachment(true);
    void prepareAttachment(pending.file)
      .then((attachment) => {
        setAttachments((previous) => [...previous, attachment]);
        setDraft((previous) => previous || "ช่วยอ่านสลิปนี้และร่างรายการให้ตรวจด้วย");
      })
      .catch(() => setError("เตรียมสลิปจากขั้นตอนเริ่มต้นไม่สำเร็จ ลองแนบภาพใหม่ได้เลย"))
      .finally(() => setPreparingAttachment(false));
  }, [onboardingHandoff, onboardingScope]);

  useEffect(() => {
    if (!logRef.current) return;
    logRef.current.scrollTop = logRef.current.scrollHeight;
  }, [messages, busy]);

  useEffect(() => {
    const speechWindow = window as SpeechWindow;
    setVoiceSupported(Boolean(speechWindow.SpeechRecognition ?? speechWindow.webkitSpeechRecognition));
    return () => recognitionRef.current?.abort();
  }, []);

  useEffect(() => () => { if (idleTimer.current) clearTimeout(idleTimer.current); }, []);

  function navigate(href: string) {
    router.push(href);
    if (!window.matchMedia("(min-width: 1240px)").matches) onClose?.();
  }

  async function sendMessage(messageText: string, confirmRecords = false) {
    const currentAttachments = attachments;
    const text = messageText.trim() || (currentAttachments.length ? "ช่วยดูรายละเอียดในภาพที่แนบมา และถามกลับหากข้อมูลสำคัญยังไม่ชัดเจน" : "");
    if ((!text && !currentAttachments.length) || busyRef.current || preparingAttachment) return;
    const request = messages.at(-1)?.recordRequest;
    const typedApproval = /^(?:อนุญาต(?:ให้ใช้รายการ)?|ยืนยัน|ได้เลย|ได้|ตกลง|ใช้ได้เลย|yes|sure)(?:ครับ|ค่ะ|จ้า)?[.! ]*$/iu.test(text);
    const approved = !currentAttachments.length && request && (confirmRecords || typedApproval) ? request : null;
    const year = approved?.year ?? "all";
    const month = approved?.month ?? "all";
    const includeFinanceData = Boolean(approved);
    const question = approved
      ? `อนุญาตให้ใช้รายการ${approved.tax ? "และข้อมูลเตรียมภาษี" : ""}ช่วง ${scopeName(year, month)} เพื่อตอบคำถามก่อนหน้าในครั้งนี้`
      : text;
    if (!currentAttachments.length && isDuplicateConfirmation(text)) {
      setMessages((current) => [
        ...current,
        { role: "user", content: text },
        { role: "assistant", content: "เป๋าวีนข้ามรายการที่พบว่าซ้ำไว้แล้วครับ", completed: true },
      ]);
      setDraft("");
      setError("");
      return;
    }
    if (!approved && !currentAttachments.length && isBatchConfirmation(text)) {
      await saveBatch(text);
      return;
    }
    const navigation = !ready && !currentAttachments.length ? parseNavigationRequest(text) : null;
    if (navigation) {
      const next = [...messages, { role: "user" as const, content: text }];
      setMessages([...next, {
        role: "assistant",
        completed: true,
        content: navigation.localOnly
          ? `เปิดหน้าข้อมูล${navigation.label}ให้แล้วครับ ฟีเจอร์นี้ยังจัดการได้เฉพาะในแอปบนเครื่อง จึงไม่มีการส่งข้อมูลบิลหรือบริบทการซื้อขึ้นเว็บ`
          : `เปิดหน้า${navigation.label}ให้แล้วครับ แชตยังอยู่ตรงนี้ คุยต่อได้เลย`,
      }]);
      setDraft("");
      setError("");
      setMood("talking");
      if (idleTimer.current) clearTimeout(idleTimer.current);
      idleTimer.current = setTimeout(() => setMood("idle"), 2200);
      navigate(navigation.href);
      return;
    }
    if (!ready) {
      setError("AI ยังปิดอยู่ ตอนนี้ใช้คำสั่งพาไปหน้าในเว็บได้ หรือเปิด AI ในตั้งค่าเพื่อเริ่มคุย");
      return;
    }
    if (idleTimer.current) clearTimeout(idleTimer.current);
    const previous = messages;
    const shareableMessages = previous.filter(({ context }) => !context || (
      approved && context.year === year && context.month === month && (!context.taxLookupPerformed || approved.tax)
    ));
    const cards = shareableMessages.flatMap((message) => message.proposals ?? [])
      .filter((card) => card.status === "pending" || card.status === "saved");
    const referencedNumber = Number(text.match(/#\s*(\d+)/u)?.[1]);
    const referencedCard = cards.find((card) => card.number === referencedNumber);
    const sortedCards = referencedCard ? [...cards.filter((card) => card !== referencedCard), referencedCard] : cards;
    const conversationItems = sortedCards
      .slice(currentAttachments.length ? -3 : -20)
      .map(({ number, status, proposal }) => {
        const { pocket_id: _pocket, destination_pocket_id: _destination, ...chatProposal } = proposal;
        return { number, status, proposal: chatProposal };
      });
    const next = [...previous, { role: "user" as const, content: question, ...(currentAttachments.length ? { attachments: currentAttachments } : {}) }];
    setMessages(next);
    setDraft("");
    setAttachments([]);
    if (attachmentInputRef.current) attachmentInputRef.current.value = "";
    setError("");
    setBusy(true);
    busyRef.current = true;
    recognitionRef.current?.stop();
    setListening(false);
    setMood("listening");
    let streamedText = "";
    try {
      setMood("thinking");
      const response = await fetch("/api/ai/chat", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          message: question,
          year,
          month,
          includeFinanceData,
          conversationItems,
          ...(currentAttachments.length ? { images: currentAttachments.map((attachment) => attachment.dataUrl) } : {}),
          history: buildAssistantHistory(shareableMessages.map((message) => ({ ...message, proposals: undefined })), { year, month, includeFinanceData }),
        }),
      });
      if (!response.ok) {
        const result = await response.json().catch(() => null);
        throw new Error(typeof result?.error === "string" ? result.error : "เป๋าวีนตอบไม่สำเร็จ ลองใหม่อีกครั้งนะ");
      }
      if (!response.body) throw new Error("เบราว์เซอร์เปิดสตรีมคำตอบไม่ได้ ลองใหม่อีกครั้งนะ");
      const reader = response.body.getReader();
      const decoder = new TextDecoder();
      let buffer = "";
      let completion: {
        proposals?: TransactionProposal[] | null;
        proposal?: TransactionProposal | null;
        categoryOptions?: unknown[];
        duplicates?: TransactionProposal[];
        duplicateImagePositions?: number[];
        edit?: unknown;
        navigation?: unknown;
        recordRequest?: unknown;
        replySuggestions?: unknown;
        context?: ChatMessage["context"];
      } | null = null;
      setMessages([...next, { role: "assistant", content: "" }]);
      while (true) {
        const { value, done } = await reader.read();
        buffer += decoder.decode(value, { stream: !done });
        let boundary = buffer.indexOf("\n\n");
        while (boundary >= 0) {
          const frame = buffer.slice(0, boundary);
          buffer = buffer.slice(boundary + 2);
          const eventName = frame.match(/^event: (.+)$/m)?.[1];
          const dataLine = frame.split("\n").find((line) => line.startsWith("data: "));
          if (dataLine) {
            const data = JSON.parse(dataLine.slice(6));
            if (eventName === "delta" && typeof data.text === "string") {
              streamedText += data.text;
              setMessages([...next, { role: "assistant", content: streamedText }]);
            } else if (eventName === "replace" && typeof data.text === "string") {
              streamedText = data.text;
              setMessages([...next, { role: "assistant", content: streamedText }]);
            } else if (eventName === "complete") completion = data;
            else if (eventName === "error") throw new Error(typeof data.error === "string" ? data.error : "เป๋าวีนตอบไม่สำเร็จ ลองใหม่อีกครั้งนะ");
          }
          boundary = buffer.indexOf("\n\n");
        }
        if (done) break;
      }
      if (!completion) throw new Error("สตรีมคำตอบจบก่อนส่งข้อมูลครบ ลองใหม่อีกครั้งนะ");
      const returnedProposals = Array.isArray(completion.proposals)
        ? completion.proposals
        : completion.proposal && typeof completion.proposal === "object" ? [completion.proposal] : [];
      const duplicates = Array.isArray(completion.duplicates) ? [...completion.duplicates] : [];
      const activeKeys = new Set(cards.filter((card) => card.status === "pending").map((card) => transactionMatchKey(card.proposal)));
      const proposals: ProposalCard[] = [];
      for (const [index, proposal] of returnedProposals.entries()) {
        if (!proposal || typeof proposal !== "object") continue;
        const key = transactionMatchKey(proposal);
        if (activeKeys.has(key)) {
          duplicates.push(proposal);
          continue;
        }
        activeKeys.add(key);
        const categoryOptions = parseCategoryOptions(completion.categoryOptions?.[index]);
        proposals.push({
          id: crypto.randomUUID(), number: ++proposalNumber.current, proposal, status: "pending",
          categoryOptions, categoryNeedsChoice: categoryOptions.length > 0,
        });
      }
      const edit = draftEditSchema.safeParse(completion.edit);
      const recordRequest = recordRequestSchema.safeParse(completion.recordRequest);
      const destination = assistantNavigationSchema.safeParse(completion.navigation);
      const changedMessages = edit.success ? next.map((message) => message.proposals ? {
        ...message,
        proposals: message.proposals.map((card) => card.number === edit.data.number && (card.status === "pending" || card.status === "saved")
          ? {
            ...card, proposal: { ...card.proposal, ...edit.data.changes }, status: "pending" as const, error: undefined,
            ...(edit.data.changes.category === undefined ? {} : { categoryOptions: [], categoryNeedsChoice: false }),
          }
          : card),
      } : message) : next;
      const hasExpenseProposal = proposals.some(({ proposal }) => proposal.transaction_type === "expense");
      if (currentAttachments.length || hasExpenseProposal) expenseMoments.current += 1;
      const actionNotes = [
        edit.success ? `ปรับรายการ #${edit.data.number} ในแชตแล้วครับ พิมพ์ “ยืนยัน” เพื่อบันทึกพร้อมรายการอื่นที่รออยู่` : "",
        destination.success ? `เปิดหน้า${assistantPages[destination.data.page].label}ให้แล้วครับ` : "",
      ].filter(Boolean);
      setMessages([...changedMessages, {
        role: "assistant",
        content: actionNotes.length && !proposals.length && !streamedText.includes("?")
          ? actionNotes.join("\n") : [streamedText, ...actionNotes].join("\n"),
        completed: true,
        context: completion.context ?? null,
        recordRequest: recordRequest.success && !approved ? recordRequest.data : undefined,
        proposals,
        duplicates,
        duplicateImagePositions: completion.duplicateImagePositions,
        replySuggestions: parseReplySuggestions(completion.replySuggestions),
      }]);
      setMood(expenseMoments.current >= 2 && (currentAttachments.length || hasExpenseProposal) ? "comic" : "talking");
      idleTimer.current = setTimeout(() => setMood("idle"), 3200);
      if (destination.success) navigate(navigationHref(destination.data));
    } catch (caught) {
      if (approved) setMessages(previous);
      else if (!streamedText) setMessages(next);
      setError(caught instanceof Error ? caught.message : "ส่งข้อความไม่สำเร็จ ลองใหม่อีกครั้งนะ");
      setMood("error");
    } finally {
      setBusy(false);
      busyRef.current = false;
      inputRef.current?.focus();
    }
  }

  function updateProposal(index: number, proposalId: string, update: (card: ProposalCard) => ProposalCard) {
    setMessages((current) => current.map((item, itemIndex) => itemIndex === index && item.proposals
      ? { ...item, proposals: item.proposals.map((card) => card.id === proposalId ? update(card) : card) }
      : item));
  }

  async function saveBatch(text: string) {
    const pending = messages.flatMap((message, index) => (message.proposals ?? [])
      .filter((card) => card.status === "pending")
      .map((card) => ({ card, index })));
    const items = pending.filter(({ card }) => canSaveProposal(card));
    const awaitingDetails = pending.length - items.length;
    const addReply = (content: string, replySuggestions?: string[]) => setMessages((current) => [
      ...current, { role: "assistant", content, completed: true, replySuggestions },
    ]);
    setMessages((current) => [...current, { role: "user", content: text }]);
    setDraft("");
    setError("");
    if (!items.length) {
      addReply(awaitingDetails ? "กรอกข้อมูลที่รอเลือกบนการ์ดก่อน แล้วค่อยยืนยันครับ" : "ไม่มีรายการที่รอบันทึกครับ");
      return;
    }

    if (idleTimer.current) clearTimeout(idleTimer.current);
    busyRef.current = true;
    setBusy(true);
    setSavingBatch(true);
    setMood("thinking");
    recognitionRef.current?.stop();
    const saved: number[] = [];
    const duplicates: number[] = [];
    const failed: number[] = [];
    try {
      for (const { card, index } of items) {
        const { id, number, proposal } = card;
        try {
          const response = await fetch("/api/ai/transactions", {
            method: "POST",
            headers: { "content-type": "application/json" },
            signal: AbortSignal.timeout(20_000),
            body: JSON.stringify({
              proposalId: id, proposal,
              edit: card.saved && { transactionId: card.saved.transactionId, updatedAt: card.saved.updatedAt },
            }),
          });
          const result = await response.json().catch(() => null);
          if (response.status === 409 && result?.duplicate === true) {
            duplicates.push(number);
            updateProposal(index, id, (current) => ({ ...current, status: "duplicate", error: undefined }));
            continue;
          }
          if (!response.ok || typeof result?.transactionId !== "string" || typeof result?.updatedAt !== "string") {
            throw new Error(result?.error ?? "บันทึกไม่สำเร็จ พิมพ์ “ยืนยัน” เพื่อลองอีกครั้ง");
          }
          saved.push(number);
          updateProposal(index, id, (current) => ({
            ...current, status: "saved", error: undefined,
            saved: { transactionId: result.transactionId, updatedAt: result.updatedAt, proposal },
          }));
        } catch (caught) {
          failed.push(number);
          updateProposal(index, id, (current) => ({
            ...current, error: caught instanceof Error ? caught.message : "บันทึกไม่สำเร็จ",
          }));
        }
      }
      const numbers = (items: number[]) => items.map((number) => `#${number}`).join(", ");
      addReply([
        saved.length ? `บันทึกแล้ว ${saved.length} รายการ (${numbers(saved)}) ครับ` : "",
        duplicates.length ? `ข้ามรายการซ้ำ ${numbers(duplicates)} แล้วครับ` : "",
        failed.length ? `บันทึก ${numbers(failed)} ไม่สำเร็จครับ ดูรายละเอียดที่การ์ดได้เลย` : "",
        awaitingDetails ? `มีอีก ${awaitingDetails} รายการรอเลือกข้อมูลบนการ์ดครับ` : "",
      ].filter(Boolean).join("\n"), saved.length ? ["เปิดหน้ารายการ"] : undefined);
      setMood(failed.length ? "error" : "done");
      idleTimer.current = setTimeout(() => setMood("idle"), 2200);
      if (saved.length) router.refresh();
    } finally {
      setSavingBatch(false);
      setBusy(false);
      busyRef.current = false;
    }
  }

  function dismissProposal(index: number, proposalId: string) {
    updateProposal(index, proposalId, (card) => card.saved
      ? { ...card, proposal: card.saved.proposal, status: "saved", error: undefined }
      : { ...card, status: "dismissed", error: undefined });
  }

  function chooseCategory(index: number, proposalId: string, category: string) {
    if (busyRef.current) return;
    updateProposal(index, proposalId, (card) => card.status === "pending" && card.categoryOptions?.includes(category)
      ? { ...card, proposal: { ...card.proposal, category }, categoryNeedsChoice: false, error: undefined }
      : card);
  }

  function editProposal(index: number, proposalId: string) {
    const card = messages[index]?.proposals?.find((item) => item.id === proposalId);
    if (card) prepareDraft(`แก้รายการ #${card.number} `);
  }

  function prepareDraft(text: string) {
    setDraft(text);
    requestAnimationFrame(() => {
      const input = inputRef.current;
      input?.focus();
      if (input) input.setSelectionRange(input.value.length, input.value.length);
    });
  }

  function resetConversation() {
    recognitionRef.current?.abort();
    recognitionRef.current = null;
    setListening(false);
    setMessages([]);
    proposalNumber.current = 0;
    expenseMoments.current = 0;
    setDraft("");
    setAttachments([]);
    setError("");
    setMood("idle");
    if (idleTimer.current) clearTimeout(idleTimer.current);
  }

  function beginVoiceInput() {
    const speechWindow = window as SpeechWindow;
    const SpeechRecognitionConstructor = speechWindow.SpeechRecognition ?? speechWindow.webkitSpeechRecognition;
    if (!SpeechRecognitionConstructor) {
      setError("เบราว์เซอร์นี้ยังไม่รองรับการพิมพ์ด้วยเสียง ใช้พิมพ์ข้อความแทนได้เลย");
      return;
    }
    try {
      const recognition = new SpeechRecognitionConstructor();
      recognition.lang = "th-TH";
      recognition.interimResults = false;
      recognition.maxAlternatives = 1;
      recognition.onstart = () => { setListening(true); setMood("listening"); setError(""); };
      recognition.onresult = (event) => {
        const transcript = event.results[0]?.[0]?.transcript?.trim();
        if (transcript) setDraft((current) => [current.trim(), transcript].filter(Boolean).join(" "));
      };
      recognition.onerror = (event) => {
        const messages: Record<string, string> = {
          "not-allowed": "เบราว์เซอร์ไม่ได้รับอนุญาตให้ใช้ไมโครโฟน ใช้พิมพ์ต่อได้",
          "no-speech": "ยังไม่ได้ยินเสียง ลองใหม่หรือพิมพ์แทน",
          network: "บริการถอดเสียงเชื่อมต่อไม่ได้ ใช้พิมพ์ต่อได้",
          "audio-capture": "ไม่พบไมโครโฟน ใช้พิมพ์ต่อได้",
        };
        setError(messages[event.error] ?? "ถอดเสียงไม่สำเร็จ ใช้พิมพ์ต่อได้");
        setMood("error");
      };
      recognition.onend = () => {
        setListening(false);
        if (recognitionRef.current === recognition) recognitionRef.current = null;
        if (!busyRef.current) setMood((current) => current === "listening" ? "idle" : current);
      };
      recognitionRef.current = recognition;
      recognition.start();
    } catch {
      setError("เริ่มการถอดเสียงไม่ได้ ลองพิมพ์ข้อความแทน");
      setMood("error");
    }
  }

  function toggleVoice() {
    if (listening) {
      recognitionRef.current?.stop();
      setListening(false);
      setMood("idle");
      return;
    }
    if (sessionStorage.getItem("paoween-voice-consent") === "accepted") beginVoiceInput();
    else setVoiceDialogOpen(true);
  }

  function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    void sendMessage(draft);
  }

  async function selectAttachments(files: File[]) {
    if (!files.length) return;
    setError("");
    setPreparingAttachment(true);
    try {
      if (attachments.length + files.length > maxAttachments) throw new Error(`แนบภาพได้ไม่เกิน ${maxAttachments} รูปต่อข้อความ`);
      const prepared = await Promise.all(files.map(prepareAttachment));
      setAttachments((previous) => [...previous, ...prepared]);
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "เตรียมภาพไม่สำเร็จ ลองอีกครั้งนะ");
    } finally {
      setPreparingAttachment(false);
      if (attachmentInputRef.current) attachmentInputRef.current.value = "";
    }
  }

  function onInputKeyDown(event: KeyboardEvent<HTMLTextAreaElement>) {
    if (event.key === "Enter" && !event.shiftKey && !event.nativeEvent.isComposing) {
      event.preventDefault();
      void sendMessage(draft);
    }
  }

  const status = busy ? "กำลังคิดให้รอบคอบ" : mood === "error" ? "ยังติดขัดนิดหน่อย" : mood === "comic" ? "แอบงอนรายจ่ายนิดนึง" : mood === "talking" ? "กำลังเล่าให้ฟัง" : "พร้อมช่วยคิด";

  const draftNavigation = attachments.length === 0 ? parseNavigationRequest(draft) : null;
  const draftConfirmation = attachments.length === 0 && (isBatchConfirmation(draft) || isDuplicateConfirmation(draft));
  const pending = messages.flatMap(({ proposals }) => (proposals ?? []).filter(({ status }) => status === "pending"));
  const pendingCount = pending.length;
  const saveableCount = pending.filter(canSaveProposal).length;
  const lastMessage = messages.at(-1);
  const quickReplies = lastMessage?.role === "assistant" && lastMessage.completed && !lastMessage.recordRequest
    ? lastMessage.replySuggestions ?? []
    : [];
  const quickRepliesDisabled = busy || preparingAttachment || attachments.length > 0 || draft.trim().length > 0;

  return <div className={`assistant-layout${compact ? " assistant-chat-compact" : ""}${home ? " assistant-chat-home" : ""}`}>
    <section className="assistant-conversation panel" aria-label="บทสนทนากับเป๋าวีน">
      <div className="assistant-conversation-head">
        <div className="assistant-chat-title"><h2>คุยกับเป๋าวีน</h2></div>
        <div className="assistant-conversation-actions">{messages.length > 0 && <button className="assistant-reset" type="button" onClick={resetConversation} disabled={busy} title="เริ่มบทสนทนาใหม่"><RotateCcw size={14} aria-hidden="true" /><span className="sr-only">เริ่มใหม่</span></button>}<span className={`assistant-live${ready ? "" : " is-off"}`}><i />{ready ? "AI พร้อมใช้" : "รอตั้งค่า API"}</span>{onClose && <button className={home ? "assistant-dock-close assistant-dock-close-pinned" : "assistant-dock-close"} type="button" onClick={onClose} aria-label="ปิดแชตกับเป๋าวีน"><X size={17} aria-hidden="true" /></button>}</div>
      </div>

      <div className={messages.length ? "assistant-companion-stage" : "assistant-companion-stage is-welcome"}>
        {showMascot && <PaoweenStage mood={mood} label={`น้องเป๋าวีน ${status}`} />}
        {!messages.length && <h3>วันนี้ให้ช่วยดูเรื่องไหนดี?</h3>}
      </div>
      <div className={messages.length ? "assistant-log" : "assistant-log is-empty"} ref={logRef} role="log" aria-live="polite" aria-relevant="additions" aria-label="ประวัติการสนทนา">
        {messages.map((message, index) => <article className={`assistant-bubble ${message.role}`} key={`${index}-${message.role}`}>
          <strong>{message.role === "user" ? "คุณ" : "เป๋าวีน"}</strong>
          <p>{message.content}</p>
          {message.attachments?.map((attachment, attachmentIndex) => <img className="assistant-message-image" key={`${attachment.name}-${attachmentIndex}`} src={attachment.dataUrl} alt={`ภาพที่คุณแนบ: ${attachment.name}`} />)}
          {message.recordRequest && index === messages.length - 1 && <div className="assistant-record-request">
            <span>{scopeName(message.recordRequest.year, message.recordRequest.month)}</span>
            <small>ส่งรายการล่าสุดสูงสุด 60 รายการ{message.recordRequest.tax ? " และข้อมูลเตรียมภาษีของปีที่ระบุ" : ""} ให้ OpenAI สำหรับคำตอบนี้</small>
            <button className="button-secondary" type="button" disabled={quickRepliesDisabled} onClick={() => void sendMessage("อนุญาต", true)}>อนุญาตให้ใช้รายการ</button>
          </div>}
          {message.context && <small className="assistant-evidence">อ้างอิง {message.context.transactionCount === 60 ? "ไม่เกิน 60 รายการล่าสุด" : `${message.context.transactionCount} รายการ`} · {scopeName(message.context.year, message.context.month)}{message.context.taxLookupPerformed ? ` · รายการเตรียมภาษี ${message.context.taxRecordCount} รายการ` : ""}</small>}
          {message.duplicateImagePositions?.map((position) => <p className="assistant-proposal-warning" key={position}>
            <AlertTriangle size={14} aria-hidden="true" /> รูปแนบที่ {position} ซ้ำ · ข้ามแล้ว
          </p>)}
          {message.duplicates?.map((item, duplicateIndex) => <p className="assistant-proposal-warning" key={duplicateIndex}>
            <AlertTriangle size={14} aria-hidden="true" /> รายการซ้ำ · ข้ามแล้ว ({item.description})
          </p>)}
          {message.proposals?.map((card) => <TransactionProposalCard
            key={card.id}
            card={card}
            busy={busy}
            pockets={pockets}
            onChangeDetails={(changes) => updateProposal(index, card.id, (current) => ({
              ...current, proposal: { ...current.proposal, ...changes }, error: undefined,
            }))}
            onDismiss={() => dismissProposal(index, card.id)}
            onEdit={() => editProposal(index, card.id)}
            onChooseCategory={(category) => chooseCategory(index, card.id, category)}
          />)}
        </article>)}
        {busy && <div className="assistant-thinking" role="status"><LoaderCircle size={16} aria-hidden="true" /> {savingBatch ? "กำลังบันทึกรายการ..." : "เป๋าวีนกำลังคิด..."}</div>}
      </div>

      {Boolean(pendingCount || quickReplies.length) && <div className="assistant-suggestions assistant-quick-replies" role="group" aria-label="คำตอบแนะนำ">
        {pendingCount > 0 && <>
          {saveableCount > 0 && <button type="button" disabled={quickRepliesDisabled} onClick={() => void sendMessage("ยืนยันทั้งหมด")}>
            <Check size={13} aria-hidden="true" /> {saveableCount === pendingCount ? "ยืนยันทั้งหมด" : "ยืนยันรายการที่พร้อม"} ({saveableCount})
          </button>}
          <button type="button" disabled={!ready || quickRepliesDisabled} onClick={() => prepareDraft(
            pendingCount === 1 ? `แก้ยอดรายการ #${pending[0].number} เป็น ` : "แก้ยอดรายการ #",
          )}>
            แก้ยอดรายการ
          </button>
        </>}
        {quickReplies.map((reply) => <button type="button" key={reply} disabled={quickRepliesDisabled || (!ready && !parseNavigationRequest(reply))} onClick={() => void sendMessage(reply)}>
          {reply}<ArrowUp size={13} aria-hidden="true" />
        </button>)}
      </div>}
      {error && <p className="notice notice-error assistant-error" role="alert">{error}</p>}

      {attachments.map((attachment, index) => <div className="assistant-pending-attachment" key={`${attachment.name}-${index}`}><img src={attachment.dataUrl} alt={`ตัวอย่างภาพที่เตรียมแนบ: ${attachment.name}`} /><div><strong><FileImage size={14} aria-hidden="true" /> {attachment.name}</strong><small>{Math.max(1, Math.round(attachment.sizeBytes / 1024))} KB · ยังไม่ได้ส่ง</small></div><button className="assistant-remove-attachment" type="button" aria-label={`นำภาพ ${attachment.name} ออก`} onClick={() => setAttachments((previous) => previous.filter((_, itemIndex) => itemIndex !== index))} disabled={busy}><X size={15} aria-hidden="true" /></button></div>)}
      <form className="assistant-composer" onSubmit={submit}>
        <label className="sr-only" htmlFor="assistant-message">พิมพ์ข้อความถึงเป๋าวีน</label>
        <input ref={attachmentInputRef} className="sr-only" type="file" multiple accept="image/jpeg,image/png,image/webp" aria-label="เลือกภาพที่จะแนบ" onChange={(event) => { void selectAttachments(Array.from(event.currentTarget.files ?? [])); }} />
        <button className="assistant-attach-button" type="button" aria-label="แนบรูป" title="แนบภาพได้สูงสุด 5 รูป" disabled={busy || preparingAttachment || attachments.length >= maxAttachments} onClick={() => attachmentInputRef.current?.click()}>{preparingAttachment ? <LoaderCircle size={17} className="assistant-spinner" aria-hidden="true" /> : <Paperclip size={17} aria-hidden="true" />}</button>
        <textarea id="assistant-message" ref={inputRef} rows={2} maxLength={4000} value={draft} onChange={(event) => setDraft(event.target.value)} onKeyDown={onInputKeyDown} placeholder={saveableCount ? "พิมพ์ “ยืนยัน” หรือบอกว่าจะแก้รายการไหน" : "พิมพ์ถึงเป๋าวีน…"} disabled={busy} />
        <button className={`assistant-voice-button${listening ? " listening" : ""}`} type="button" aria-label={listening ? "หยุดฟังเสียง" : "ใช้เสียงพิมพ์ข้อความ"} title={voiceSupported ? (listening ? "หยุดฟังเสียง" : "ใช้เสียงพิมพ์ข้อความ") : "เบราว์เซอร์นี้ยังไม่รองรับการถอดเสียง"} disabled={!voiceSupported || busy} onClick={toggleVoice}>{listening ? <MicOff size={17} aria-hidden="true" /> : <Mic size={17} aria-hidden="true" />}</button>
        <button className="button-primary assistant-send" type="submit" aria-label="ส่งข้อความ" disabled={busy || preparingAttachment || (!draft.trim() && !attachments.length) || (!ready && !draftNavigation && !draftConfirmation)}>{busy ? <LoaderCircle size={18} className="assistant-spinner" aria-hidden="true" /> : <ArrowUp size={18} aria-hidden="true" />}</button>
      </form>
      <div className="assistant-composer-foot">
        <span>{ready ? "ข้อความและภาพที่ส่งจะไปยัง OpenAI" : <>AI ปิดอยู่ · คำสั่งนำทางยังใช้ได้ · ไปที่ <a href="/dashboard/settings">ตั้งค่า</a> เพื่อเปิด AI</>}</span>{draft.length >= 3600 && <span>{draft.length}/4000</span>}
      </div>
    </section>
    {voiceDialogOpen && <div className="voice-consent-backdrop" role="presentation"><section className="voice-consent-dialog" role="dialog" aria-modal="true" aria-labelledby="voice-consent-title">
      <span className="assistant-empty-icon"><Mic size={19} aria-hidden="true" /></span><h2 id="voice-consent-title">ใช้เสียงแทนการพิมพ์?</h2>
      <p>เบราว์เซอร์อาจส่งเสียงไปยังผู้ให้บริการถอดเสียงตามการตั้งค่าของเบราว์เซอร์ เป๋าวีนจะรับเฉพาะข้อความที่ถอดได้มาใส่ในช่องให้ตรวจ และจะไม่ส่งข้อความไป AI จนกว่าคุณจะกดส่ง</p>
      <div><button className="button-secondary" type="button" onClick={() => setVoiceDialogOpen(false)}>ใช้พิมพ์ต่อ</button><button className="button-primary" type="button" onClick={() => { sessionStorage.setItem("paoween-voice-consent", "accepted"); setVoiceDialogOpen(false); beginVoiceInput(); }}>ยอมรับและเปิดไมค์</button></div>
    </section></div>}
  </div>;
}

function canSaveProposal(card: ProposalCard) {
  const proposal = card.proposal;
  if (card.categoryNeedsChoice) return false;
  if (proposal.transaction_type === "investment" && !proposal.investment_direction) return false;
  if (proposal.transaction_type === "transfer") {
    return Boolean(proposal.pocket_id && proposal.destination_pocket_id && proposal.pocket_id !== proposal.destination_pocket_id);
  }
  return true;
}

function TransactionProposalCard({ card, busy, pockets, onChangeDetails, onDismiss, onEdit, onChooseCategory }: {
  card: ProposalCard;
  busy: boolean;
  pockets: PocketOption[];
  onChangeDetails: (changes: Partial<Pick<ConfirmationProposal, "investment_direction" | "pocket_id" | "destination_pocket_id">>) => void;
  onDismiss: () => void;
  onEdit: () => void;
  onChooseCategory: (category: string) => void;
}) {
  const { proposal } = card;
  if (card.status === "dismissed") return null;
  const typeLabels: Record<TransactionProposal["transaction_type"], string> = { income: "รายรับ", expense: "รายจ่าย", investment: "ลงทุน", transfer: "โอนระหว่างบัญชี" };
  const date = new Date(`${proposal.transaction_date}T00:00:00.000Z`);
  const dateLabel = Number.isFinite(date.getTime()) ? new Intl.DateTimeFormat("th-TH", { dateStyle: "long", timeZone: "Asia/Bangkok" }).format(date) : proposal.transaction_date;
  const amount = Number(proposal.amount_thb);
  const isInvestment = proposal.transaction_type === "investment";
  const isTransfer = proposal.transaction_type === "transfer";
  const pocketName = (id?: string | null) => pockets.find((pocket) => pocket.id === id)?.name ?? "ยังไม่ระบุกระเป๋า";
  return <section className={`assistant-proposal${card.status === "saved" ? " is-saved" : ""}`} aria-label={`รายการ #${card.number}`}>
    <div className="assistant-proposal-title"><span><Sparkles size={14} aria-hidden="true" /> รายการ #{card.number}</span>{card.status === "saved" && <span className="assistant-proposal-saved"><Check size={13} aria-hidden="true" /> บันทึกแล้ว</span>}</div>
    <dl>
      <div><dt>วันที่</dt><dd>{dateLabel}</dd></div>
      <div><dt>ประเภท</dt><dd>{typeLabels[proposal.transaction_type]}</dd></div>
      <div><dt>รายการ</dt><dd>{proposal.description}</dd></div>
      <div><dt>จำนวนเงิน</dt><dd>{Number.isFinite(amount) ? `${new Intl.NumberFormat("th-TH", { minimumFractionDigits: 2, maximumFractionDigits: 2 }).format(amount)} บาท` : `${proposal.amount_thb} บาท`}</dd></div>
      <div><dt>หมวดหมู่</dt><dd>{card.categoryNeedsChoice && card.status === "pending" ? "รอเลือกหมวด" : proposal.category}</dd></div>
      {card.status === "saved" && isInvestment && <div><dt>ซื้อหรือขาย</dt><dd>{proposal.investment_direction === "buy" ? "ซื้อ" : "ขาย"}</dd></div>}
      {card.status === "saved" && <div><dt>{pocketLabel(proposal.transaction_type, proposal.investment_direction)}</dt><dd>{pocketName(proposal.pocket_id)}{isTransfer && ` → ${pocketName(proposal.destination_pocket_id)}`}</dd></div>}
      {proposal.action && <div><dt>หมายเหตุ</dt><dd>{proposal.action}</dd></div>}
    </dl>
    {card.status === "pending" && <div className="assistant-pocket-fields">
      {isInvestment && <label>ซื้อหรือขาย
        <select value={proposal.investment_direction ?? ""} disabled={busy} onChange={(event) => {
          const value = event.target.value;
          onChangeDetails({ investment_direction: value === "buy" || value === "sell" ? value : null });
        }}>
          <option value="">เลือกซื้อหรือขาย</option><option value="buy">ซื้อ</option><option value="sell">ขาย</option>
        </select>
      </label>}
      <label>{pocketLabel(proposal.transaction_type, proposal.investment_direction)}
        <PocketSelect options={pockets} value={proposal.pocket_id ?? ""} disabled={busy} emptyLabel={isTransfer ? "เลือกต้นทาง" : undefined} onChange={(event) => onChangeDetails({ pocket_id: event.target.value || null, ...(event.target.value === proposal.destination_pocket_id ? { destination_pocket_id: null } : {}) })} />
      </label>
      {isTransfer && <label>กระเป๋าปลายทาง
        <PocketSelect options={pockets.filter((pocket) => pocket.id !== proposal.pocket_id)} value={proposal.destination_pocket_id === proposal.pocket_id ? "" : proposal.destination_pocket_id ?? ""} disabled={busy} emptyLabel="เลือกปลายทาง" onChange={(event) => onChangeDetails({ destination_pocket_id: event.target.value || null })} />
      </label>}
      {isTransfer && pockets.length < 2 && <Link href="/dashboard/pockets" className="text-link">เพิ่มให้ครบสองกระเป๋า</Link>}
    </div>}
    {card.status === "duplicate" && <p className="assistant-proposal-warning"><AlertTriangle size={14} aria-hidden="true" /> รายการซ้ำ · ข้ามแล้ว</p>}
    {card.error && <p className="assistant-proposal-error" role="alert">{card.error}</p>}
    {card.status === "pending" && Boolean(card.categoryOptions?.length) && <>
      {card.categoryNeedsChoice && <p className="assistant-proposal-warning"><AlertTriangle size={14} aria-hidden="true" /> ลองเลือกหมวดที่ตรงกับสลิปครับ</p>}
      <div className="assistant-suggestions assistant-quick-replies assistant-category-options" role="group" aria-label={`เลือกหมวดของรายการ #${card.number}`}>
        {card.categoryOptions?.map((category) => <button type="button" key={category} disabled={busy}
          aria-pressed={!card.categoryNeedsChoice && proposal.category === category} onClick={() => onChooseCategory(category)}>
          {!card.categoryNeedsChoice && proposal.category === category && <Check size={13} aria-hidden="true" />}
          {category}
        </button>)}
      </div>
    </>}
    {card.status !== "duplicate" && <div className="assistant-proposal-actions">
      <button className="button-secondary" type="button" disabled={busy} onClick={onEdit}>แก้ในแชต</button>
      {card.status !== "saved" && <button className="button-secondary" type="button" disabled={busy} onClick={onDismiss}>
        <X size={14} aria-hidden="true" /> {card.saved ? "ยกเลิกการแก้" : "ข้ามรายการ"}
      </button>}
    </div>}
  </section>;
}
