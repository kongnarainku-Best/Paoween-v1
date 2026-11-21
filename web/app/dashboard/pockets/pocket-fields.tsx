import type { PocketOption } from "@/lib/finance/pocket";

export function PocketSelect({ options, value, emptyLabel = "ยังไม่ระบุกระเป๋า", ...props }: {
  options: PocketOption[];
  value: string;
  emptyLabel?: string;
} & Omit<React.ComponentProps<"select">, "value">) {
  return <select value={value} {...props}>
    <option value="">{emptyLabel}</option>
    {options.map(({ id, name }) => <option value={id} key={id}>{name}</option>)}
  </select>;
}
