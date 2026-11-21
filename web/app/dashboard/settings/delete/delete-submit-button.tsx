"use client";

import { Trash2 } from "lucide-react";
import { useFormStatus } from "react-dom";

export function DeleteSubmitButton() {
  const { pending } = useFormStatus();

  return <button className="button-danger" type="submit" disabled={pending}>
    <Trash2 size={16} aria-hidden="true" />
    {pending ? "กำลังลบบัญชี…" : "ลบบัญชีและข้อมูลถาวร"}
  </button>;
}
