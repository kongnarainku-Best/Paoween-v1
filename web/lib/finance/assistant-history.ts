export const assistantHistoryMaxMessages = 8;
export const assistantHistoryMaxMessageLength = 1_200;
export const assistantHistoryMaxLength = 4_800;

type Scope = { year: string; month: string };
type HistoryMessage = { role: "user" | "assistant"; content: string };
type VisibleMessage = HistoryMessage & {
  completed?: boolean;
  attachments?: object[];
  context?: Scope | null;
  proposals?: Array<{ proposal: {
    transaction_date: string;
    transaction_type: string;
    description: string;
    amount_thb: string;
    category: string;
    action: string;
  } }>;
  proposal?: {
    transaction_date: string;
    transaction_type: string;
    description: string;
    amount_thb: string;
    category: string;
    action: string;
  } | null;
};

function historyMessage(message: VisibleMessage): HistoryMessage {
  const { role, content, attachments, proposal, proposals } = message;
  const imageNote = attachments?.length ? `\n[มีภาพแนบ ${attachments.length} ภาพในข้อความก่อนหน้า แต่ระบบไม่ได้ส่งภาพเหล่านั้นซ้ำ]` : "";
  const priorDrafts = proposals?.map(({ proposal: item }) => item) ?? (proposal ? [proposal] : []);
  const draftNote = priorDrafts.length
    ? `\n[ร่างก่อนหน้า ${priorDrafts.map((item, index) => `${index + 1}) วันที่ ${item.transaction_date}; ประเภท ${item.transaction_type}; รายการ ${item.description.slice(0, 80)}; ยอด ${item.amount_thb} บาท; หมวด ${item.category}${item.action ? `; หมายเหตุ ${item.action.slice(0, 50)}` : ""}`).join(" | ")}]`.slice(0, 700)
    : "";
  const maxTextLength = Math.min(600, assistantHistoryMaxMessageLength - imageNote.length - draftNote.length);
  return { role, content: content.slice(-maxTextLength) + imageNote + draftNote };
}

export function buildAssistantHistory(messages: readonly VisibleMessage[], scope: Scope & { includeFinanceData: boolean }): HistoryMessage[] {
  const history: HistoryMessage[] = [];
  let length = 0;
  for (let index = messages.length - 1; index > 0 && history.length < assistantHistoryMaxMessages; index--) {
    const reply = messages[index];
    const question = messages[index - 1];
    if (reply.role !== "assistant" || !reply.completed || !reply.content.trim() || question.role !== "user") continue;
    index--;

    // A previous reply may repeat account data from the period shared for that turn.
    if (reply.context && (!scope.includeFinanceData || reply.context.year !== scope.year || reply.context.month !== scope.month)) continue;

    const pair = [historyMessage(question), historyMessage(reply)];
    const pairLength = pair[0].content.length + pair[1].content.length;
    if (length + pairLength > assistantHistoryMaxLength) break;
    history.unshift(...pair);
    length += pairLength;
  }
  return history;
}
