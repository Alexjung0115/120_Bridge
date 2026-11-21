"use client";

import { useRef } from "react";
import Link from "next/link";

export function CancelConsultation() {
  const dialogRef = useRef<HTMLDialogElement>(null);

  return (
    <>
      <button type="button" onClick={() => dialogRef.current?.showModal()} className="mt-3 min-h-12 text-text-subtle underline underline-offset-4 type-body-small">
        상담 취소
      </button>
      <dialog ref={dialogRef} aria-labelledby="cancel-title" aria-describedby="cancel-description" className="m-auto w-[calc(100%-3rem)] max-w-md rounded-guide-xlarge border border-border-gray-light bg-background-white p-6 text-text-basic shadow-xl backdrop:bg-text-static/50">
        <h2 id="cancel-title" className="type-body-medium-bold text-text-bolder">상담을 취소하시겠어요?</h2>
        <p id="cancel-description" className="mt-2 type-body-small text-text-subtle">민원 내용을 확인하지 않고 처음 화면으로 돌아갑니다.</p>
        <div className="mt-6 flex flex-col gap-3 sm:flex-row">
          <button type="button" autoFocus onClick={() => dialogRef.current?.close()} className="min-h-12 flex-1 rounded-guide-xlarge border border-border-primary px-4 type-body-small-bold text-text-primary">상담 계속하기</button>
          <Link href="/citizen" className="flex min-h-12 flex-1 items-center justify-center rounded-guide-xlarge bg-element-danger px-4 type-body-small-bold text-text-inverse-static">상담 취소하기</Link>
        </div>
      </dialog>
    </>
  );
}
