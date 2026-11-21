"use client";

import { AlertTriangle, ArrowUp, CalendarDays, Check, FileImage, LoaderCircle, MessageCircle, Mic, MicOff, Paperclip, RotateCcw, ShieldCheck, Sparkles, X } from "lucide-react";
import { FormEvent, KeyboardEvent, useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";

import { PaoweenStage } from "@/app/dashboard/paoween-stage";
import { assistantNavigationSchema, assistantPages, draftEditSchema, isBatchConfirmation, isDuplicateConfirmation, navigationHref, type TransactionProposal } from "@/lib/finance/assistant-actions";
import { buildAssistantHistory } from "@/lib/finance/assistant-history";

type MonthOption = { key: string; label: string };
type SavedTransaction = { transactionId: string; updatedAt: string; proposal: TransactionProposal };
type ProposalCard = {
  id: string;
  number: number;
  proposal: TransactionProposal;
  status: "pending" | "duplicate" | "saved" | "dismissed";
  saved?: SavedTransaction;
  error?: string;
};
type ChatAttachment = { name: string; dataUrl: string; sizeBytes: number };
type ChatMessage = { role: "user" | "assistant"; content: string; completed?: boolean; attachments?: ChatAttachment[]; context?: { year: string; month: string; transactionCount: number; taxRecordCount: number; taxLookupPerformed: boolean } | null; proposals?: ProposalCard[] };
type Props = { years: string[]; months: MonthOption[]; initialYear: string; initialMonth: string; ready: boolean; home?: boolean; compact?: boolean; showMascot?: boolean; onClose?: () => void };
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

const suggestions = [
  { label: "ช่วยดูภาพรวมให้หน่อย", prompt: "สรุปภาพรวมการเงินเดือนที่เลือก และบอก 3 เรื่องที่ควรตรวจ" },
  { label: "เงินไปไหนบ้าง", prompt: "ช่วยสรุปรายจ่ายตามหมวดหมู่ของเดือนที่เลือก และชี้หมวดที่สูงที่สุด" },
  { label: "เตรียมภาษี", prompt: "ช่วยดูรายการเตรียมภาษีของปีที่เลือกว่ามีอะไรที่ยังรอตรวจหรือขาดเอกสารบ้าง" },
];

function scopeName(year: string, month: string) {
  const monthLabel = month === "all" ? "ทุกเดือน" : new Intl.DateTimeFormat("th-TH", { month: "long", timeZone: "Asia/Bangkok" })
    .format(new Date(Date.UTC(2026, Number(month) - 1, 1)));
  return `${year === "all" ? "ทุกปี" : String(Number(year) + 543)} · ${monthLabel}`;
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

export function AssistantChat({ years, months, initialYear, initialMonth, ready, home = false, compact = false, showMascot = true, onClose }: Props) {
  const router = useRouter();
  const [year, setYear] = useState(initialYear);
  const [month, setMonth] = useState(initialMonth);
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [draft, setDraft] = useState("");
  const [attachments, setAttachments] = useState<ChatAttachment[]>([]);
  const [preparingAttachment, setPreparingAttachment] = useState(false);
  const [includeFinanceData, setIncludeFinanceData] = useState(false);
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

  async function sendMessage(messageText: string) {
    const currentAttachments = attachments;
    const text = messageText.trim() || (currentAttachments.length ? "ช่วยดูรายละเอียดในภาพที่แนบมา และถามกลับหากข้อมูลสำคัญยังไม่ชัดเจน" : "");
    if ((!text && !currentAttachments.length) || busyRef.current || preparingAttachment) return;
    const allowDuplicate = isDuplicateConfirmation(text);
    if (!currentAttachments.length && (isBatchConfirmation(text) || allowDuplicate)) {
      await saveBatch(text, allowDuplicate);
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
    const cards = previous.flatMap((message) => message.proposals ?? []).filter((card) => card.status !== "dismissed");
    const referencedNumber = Number(text.match(/#\s*(\d+)/u)?.[1]);
    const referencedCard = cards.find((card) => card.number === referencedNumber);
    const sortedCards = referencedCard ? [...cards.filter((card) => card !== referencedCard), referencedCard] : cards;
    const conversationItems = sortedCards
      .slice(currentAttachments.length ? -3 : -20)
      .map(({ number, status, proposal }) => ({ number, status, proposal }));
    const next = [...previous, { role: "user" as const, content: text, ...(currentAttachments.length ? { attachments: currentAttachments } : {}) }];
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
          message: text,
          year,
          month,
          includeFinanceData,
          conversationItems,
          ...(currentAttachments.length ? { images: currentAttachments.map((attachment) => attachment.dataUrl) } : {}),
          history: buildAssistantHistory(previous.map((message) => ({ ...message, proposals: undefined })), { year, month, includeFinanceData }),
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
        edit?: unknown;
        navigation?: unknown;
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
      const proposals: ProposalCard[] = returnedProposals
        .filter((proposal): proposal is TransactionProposal => Boolean(proposal && typeof proposal === "object"))
        .map((proposal) => ({ id: crypto.randomUUID(), number: ++proposalNumber.current, proposal, status: "pending" }));
      const edit = draftEditSchema.safeParse(completion.edit);
      const destination = assistantNavigationSchema.safeParse(completion.navigation);
      const changedMessages = edit.success ? next.map((message) => message.proposals ? {
        ...message,
        proposals: message.proposals.map((card) => card.number === edit.data.number && card.status !== "dismissed"
          ? { ...card, proposal: { ...card.proposal, ...edit.data.changes }, status: "pending" as const, error: undefined }
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
        proposals,
      }]);
      setMood(expenseMoments.current >= 2 && (currentAttachments.length || hasExpenseProposal) ? "comic" : "talking");
      idleTimer.current = setTimeout(() => setMood("idle"), 3200);
      if (destination.success) navigate(navigationHref(destination.data));
    } catch (caught) {
      if (!streamedText) setMessages(next);
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

  async function saveBatch(text: string, allowDuplicate: boolean) {
    const eligibleStatus = allowDuplicate ? "duplicate" : "pending";
    const items = messages.flatMap((message, index) => (message.proposals ?? [])
      .filter((card) => card.status === eligibleStatus)
      .map((card) => ({ card, index })));
    const addReply = (content: string) => setMessages((current) => [
      ...current, { role: "assistant", content, completed: true },
    ]);
    setMessages((current) => [...current, { role: "user", content: text }]);
    setDraft("");
    setError("");
    if (!items.length) {
      addReply(allowDuplicate ? "ไม่มีรายการซ้ำที่รออยู่ครับ" : "ไม่มีรายการที่รอบันทึกครับ");
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
              proposalId: id, proposal, allowDuplicate,
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
        duplicates.length ? `พบรายการซ้ำ ${numbers(duplicates)} ถ้าเป็นคนละรายการจริง ให้พิมพ์ “บันทึกซ้ำ”` : "",
        failed.length ? `บันทึก ${numbers(failed)} ไม่สำเร็จครับ ดูรายละเอียดที่การ์ดได้เลย` : "",
      ].filter(Boolean).join("\n"));
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

  function editProposal(index: number, proposalId: string) {
    const card = messages[index]?.proposals?.find((item) => item.id === proposalId);
    if (!card) return;
    setDraft(`แก้รายการ #${card.number} `);
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
  const pendingCount = messages.reduce((count, message) =>
    count + (message.proposals?.filter(({ status }) => status === "pending").length ?? 0), 0);

  return <div className={`assistant-layout${compact ? " assistant-chat-compact" : ""}${home ? " assistant-chat-home" : ""}`}>
    {!compact && <section className={`assistant-companion panel${home ? " assistant-home-companion" : ""}`} aria-label="คุยกับน้องเป๋าวีน">
      <div className="assistant-stage">
        <div className="assistant-orbit" aria-hidden="true" />
        <div className="assistant-stage-label"><Sparkles size={13} aria-hidden="true" /> YOUR MONEY BUDDY</div>
        <PaoweenStage mood={mood} label={`น้องเป๋าวีน ${status}`} />
        <div className={`assistant-character-status${mood === "error" ? " is-error" : ""}`}><i />{status}</div>
      </div>
      <div className="assistant-welcome"><span>เป๋าวีนเอง!</span><h2>วันนี้ให้ช่วยดูเรื่องไหนดี?</h2><p>ถามเรื่องรายรับรายจ่าย หรือเตรียมรายการภาษีได้เลย เป๋าวีนจะช่วยคิดจากข้อมูลที่คุณเลือก</p></div>
      <div className="assistant-month"><span><CalendarDays size={15} aria-hidden="true" /> ช่วงข้อมูลที่เป๋าวีนใช้</span>
        <div className="assistant-scope-selects">
          <label><span className="sr-only">เลือกปี</span><select aria-label="เลือกปี" value={year} onChange={(event) => setYear(event.target.value)}><option value="all">ทุกปี</option>{years.map((value) => <option value={value} key={value}>{Number(value) + 543}</option>)}</select></label>
          <label><span className="sr-only">เลือกเดือน</span><select aria-label="เลือกเดือน" value={month} onChange={(event) => setMonth(event.target.value)}>{months.map((option) => <option value={option.key} key={option.key}>{option.label}</option>)}</select></label>
        </div>
      </div>
      <div className="assistant-data-note"><ShieldCheck size={16} aria-hidden="true" /><p>จะส่งเฉพาะข้อมูลบัญชีบนเว็บของคุณตามตัวเลือกด้านล่าง ไม่มีการอ่านไฟล์ CSV ในเครื่อง</p></div>
    </section>}

    <section className="assistant-conversation panel" aria-label="บทสนทนากับเป๋าวีน">
      <div className="assistant-conversation-head">
        {compact && showMascot && <div className="assistant-mini-mascot"><PaoweenStage mood={mood} label={`น้องเป๋าวีน ${status}`} /></div>}
        <div className="assistant-chat-title"><p className="eyebrow">FINANCE COPILOT</p><h2>คุยกับเป๋าวีน</h2></div>
        <div className="assistant-conversation-actions"><button className="assistant-reset" type="button" onClick={resetConversation} disabled={busy} title="เริ่มบทสนทนาใหม่"><RotateCcw size={14} aria-hidden="true" /><span>เริ่มใหม่</span></button><span className={`assistant-live${ready ? "" : " is-off"}`}><i />{ready ? "AI พร้อมใช้" : "รอตั้งค่า API"}</span>{compact && onClose && <button className="assistant-dock-close" type="button" onClick={onClose} aria-label="ปิดแชตกับเป๋าวีน"><X size={17} aria-hidden="true" /></button>}</div>
      </div>

      <div className="assistant-log" ref={logRef} role="log" aria-live="polite" aria-relevant="additions" aria-label="ประวัติการสนทนา">
        {messages.length === 0 ? <div className="assistant-empty"><span className="assistant-empty-icon"><MessageCircle size={19} aria-hidden="true" /></span><strong>เรื่องเงินค่อย ๆ คิดไปด้วยกัน</strong><p>ลองเริ่มจากคำถามแนะนำ หรือพิมพ์เรื่องที่อยากให้ช่วยดูได้เลย</p></div> : messages.map((message, index) => <article className={`assistant-bubble ${message.role}`} key={`${index}-${message.role}`}>
          <strong>{message.role === "user" ? "คุณ" : "เป๋าวีน"}</strong>
          <p>{message.content}</p>
          {message.attachments?.map((attachment) => <img className="assistant-message-image" key={attachment.name} src={attachment.dataUrl} alt={`ภาพที่คุณแนบ: ${attachment.name}`} />)}
          {message.context && <small className="assistant-evidence">อ้างอิง {message.context.transactionCount === 60 ? "ไม่เกิน 60 รายการล่าสุด" : `${message.context.transactionCount} รายการ`} · {scopeName(message.context.year, message.context.month)}{message.context.taxLookupPerformed ? ` · รายการเตรียมภาษี ${message.context.taxRecordCount} รายการ` : ""}</small>}
          {message.proposals?.map((card) => <TransactionProposalCard key={card.id} card={card} busy={busy} onDismiss={() => dismissProposal(index, card.id)} onEdit={() => editProposal(index, card.id)} />)}
        </article>)}
        {busy && <div className="assistant-thinking" role="status"><LoaderCircle size={16} aria-hidden="true" /> {savingBatch ? "กำลังบันทึกรายการ..." : "เป๋าวีนกำลังคิด..."}</div>}
      </div>

      {!messages.length && <div className="assistant-suggestions" aria-label="คำถามแนะนำ">{suggestions.map(({ label, prompt }) => <button type="button" key={label} disabled={!ready || busy} onClick={() => void sendMessage(prompt)}>{label}<ArrowUp size={13} aria-hidden="true" /></button>)}</div>}
      {error && <p className="notice notice-error assistant-error" role="alert">{error}</p>}

      <div className="assistant-consent">
        <label><input type="checkbox" checked={includeFinanceData} onChange={(event) => setIncludeFinanceData(event.target.checked)} disabled={busy} /><span>แนบข้อมูลรายการช่วงที่เลือกให้ AI ใช้ตอบ</span></label>
        <p>{includeFinanceData ? `เมื่อส่งคำถาม จะส่งรายการไม่เกิน 60 รายการล่าสุดในช่วง ${scopeName(year, month)} และรายการเตรียมภาษีในปีที่เลือกเมื่อถามเรื่องภาษี ไปยัง OpenAI API ผ่านระบบของเป๋าวีน` : "ตอนนี้ไม่ส่งรายการเงินของคุณ"} · แนบภาพได้สูงสุด {maxAttachments} รูป และจะส่งไป OpenAI API เมื่อกดส่ง</p>
      </div>
      {attachments.map((attachment, index) => <div className="assistant-pending-attachment" key={`${attachment.name}-${index}`}><img src={attachment.dataUrl} alt={`ตัวอย่างภาพที่เตรียมแนบ: ${attachment.name}`} /><div><strong><FileImage size={14} aria-hidden="true" /> {attachment.name}</strong><small>{Math.max(1, Math.round(attachment.sizeBytes / 1024))} KB · ยังไม่ได้ส่ง</small></div><button className="assistant-remove-attachment" type="button" aria-label={`นำภาพ ${attachment.name} ออก`} onClick={() => setAttachments((previous) => previous.filter((_, itemIndex) => itemIndex !== index))} disabled={busy}><X size={15} aria-hidden="true" /></button></div>)}
      <form className="assistant-composer" onSubmit={submit}>
        <label className="sr-only" htmlFor="assistant-message">พิมพ์ข้อความถึงเป๋าวีน</label>
        <input ref={attachmentInputRef} className="sr-only" type="file" multiple accept="image/jpeg,image/png,image/webp" aria-label="เลือกภาพที่จะแนบ" onChange={(event) => { void selectAttachments(Array.from(event.currentTarget.files ?? [])); }} />
        <button className="assistant-attach-button" type="button" aria-label="แนบรูป" title="แนบภาพได้สูงสุด 5 รูป" disabled={busy || preparingAttachment || attachments.length >= maxAttachments} onClick={() => attachmentInputRef.current?.click()}>{preparingAttachment ? <LoaderCircle size={17} className="assistant-spinner" aria-hidden="true" /> : <Paperclip size={17} aria-hidden="true" />}</button>
        <textarea id="assistant-message" ref={inputRef} rows={2} maxLength={4000} value={draft} onChange={(event) => setDraft(event.target.value)} onKeyDown={onInputKeyDown} placeholder={pendingCount ? "พิมพ์ “ยืนยัน” หรือบอกว่าจะแก้รายการไหน" : "พิมพ์ข้อความ หรือแนบภาพให้เป๋าวีนช่วยดู"} disabled={busy} />
        <button className={`assistant-voice-button${listening ? " listening" : ""}`} type="button" aria-label={listening ? "หยุดฟังเสียง" : "ใช้เสียงพิมพ์ข้อความ"} title={voiceSupported ? (listening ? "หยุดฟังเสียง" : "ใช้เสียงพิมพ์ข้อความ") : "เบราว์เซอร์นี้ยังไม่รองรับการถอดเสียง"} disabled={!voiceSupported || busy} onClick={toggleVoice}>{listening ? <MicOff size={17} aria-hidden="true" /> : <Mic size={17} aria-hidden="true" />}</button>
        <button className="button-primary assistant-send" type="submit" aria-label="ส่งข้อความ" disabled={busy || preparingAttachment || (!draft.trim() && !attachments.length) || (!ready && !draftNavigation && !draftConfirmation)}>{busy ? <LoaderCircle size={18} className="assistant-spinner" aria-hidden="true" /> : <ArrowUp size={18} aria-hidden="true" />}</button>
      </form>
      <div className="assistant-composer-foot">
        <span>{pendingCount ? `${pendingCount} รายการรอบันทึก · พิมพ์ “ยืนยัน” เพื่อบันทึกทั้งหมด` : ready ? null : <>AI ปิดอยู่ · คำสั่งนำทางยังใช้ได้ · ไปที่ <a href="/dashboard/settings">ตั้งค่า</a> เพื่อเปิด AI</>}</span><span>{draft.length}/4000</span>
      </div>
    </section>
    {voiceDialogOpen && <div className="voice-consent-backdrop" role="presentation"><section className="voice-consent-dialog" role="dialog" aria-modal="true" aria-labelledby="voice-consent-title">
      <span className="assistant-empty-icon"><Mic size={19} aria-hidden="true" /></span><h2 id="voice-consent-title">ใช้เสียงแทนการพิมพ์?</h2>
      <p>เบราว์เซอร์อาจส่งเสียงไปยังผู้ให้บริการถอดเสียงตามการตั้งค่าของเบราว์เซอร์ เป๋าวีนจะรับเฉพาะข้อความที่ถอดได้มาใส่ในช่องให้ตรวจ และจะไม่ส่งข้อความไป AI จนกว่าคุณจะกดส่ง</p>
      <div><button className="button-secondary" type="button" onClick={() => setVoiceDialogOpen(false)}>ใช้พิมพ์ต่อ</button><button className="button-primary" type="button" onClick={() => { sessionStorage.setItem("paoween-voice-consent", "accepted"); setVoiceDialogOpen(false); beginVoiceInput(); }}>ยอมรับและเปิดไมค์</button></div>
    </section></div>}
  </div>;
}

function TransactionProposalCard({ card, busy, onDismiss, onEdit }: { card: ProposalCard; busy: boolean; onDismiss: () => void; onEdit: () => void }) {
  const { proposal } = card;
  if (card.status === "dismissed") return null;
  const typeLabels: Record<TransactionProposal["transaction_type"], string> = { income: "รายรับ", expense: "รายจ่าย", investment: "ลงทุน", transfer: "โอนระหว่างบัญชี" };
  const date = new Date(`${proposal.transaction_date}T00:00:00.000Z`);
  const dateLabel = Number.isFinite(date.getTime()) ? new Intl.DateTimeFormat("th-TH", { dateStyle: "long", timeZone: "Asia/Bangkok" }).format(date) : proposal.transaction_date;
  const amount = Number(proposal.amount_thb);
  return <section className={`assistant-proposal${card.status === "saved" ? " is-saved" : ""}`} aria-label={`รายการ #${card.number}`}>
    <div className="assistant-proposal-title"><span><Sparkles size={14} aria-hidden="true" /> รายการ #{card.number}</span>{card.status === "saved" && <span className="assistant-proposal-saved"><Check size={13} aria-hidden="true" /> บันทึกแล้ว</span>}</div>
    <dl>
      <div><dt>วันที่</dt><dd>{dateLabel}</dd></div>
      <div><dt>ประเภท</dt><dd>{typeLabels[proposal.transaction_type]}</dd></div>
      <div><dt>รายการ</dt><dd>{proposal.description}</dd></div>
      <div><dt>จำนวนเงิน</dt><dd>{Number.isFinite(amount) ? `${new Intl.NumberFormat("th-TH", { minimumFractionDigits: 2, maximumFractionDigits: 2 }).format(amount)} บาท` : `${proposal.amount_thb} บาท`}</dd></div>
      <div><dt>หมวดหมู่</dt><dd>{proposal.category}</dd></div>
      {proposal.action && <div><dt>หมายเหตุ</dt><dd>{proposal.action}</dd></div>}
    </dl>
    {card.status === "duplicate" && <p className="assistant-proposal-warning"><AlertTriangle size={14} aria-hidden="true" /> มีรายการที่ตรงกันในบัญชีแล้ว</p>}
    {card.error && <p className="assistant-proposal-error" role="alert">{card.error}</p>}
    <div className="assistant-proposal-actions">
      <button className="button-secondary" type="button" disabled={busy} onClick={onEdit}>แก้ในแชต</button>
      {card.status !== "saved" && <button className="button-secondary" type="button" disabled={busy} onClick={onDismiss}>
        <X size={14} aria-hidden="true" /> {card.saved ? "ยกเลิกการแก้" : "ข้ามรายการ"}
      </button>}
    </div>
  </section>;
}
