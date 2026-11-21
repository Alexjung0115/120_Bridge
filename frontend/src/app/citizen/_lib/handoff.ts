"use client";

import { useSyncExternalStore } from "react";
import { readStorage, removeStorage, writeStorage } from "./storage";
import { saveHistoryEntry } from "./history";
import type { ConsultationMessage } from "./messages";

const requestKey = "120bridge:demo-handoff";
const requestEvent = "120bridge:handoff-changed";
const activeKey = "120bridge:active-handoff";
const draftKey = "120bridge:consultation-draft";
const recentKey = "120bridge:failed-consultation";
const timeoutMs = 15_000;

export type Channel = "voice" | "text";
type Consultation = { channel: Channel; summary: string; historyId?: string };
type Request = { id: string; channel: Channel; deadline: number; status: "waiting" | "connected" | "failed" | "ended" };

function subscribe(callback: () => void) {
  window.addEventListener("storage", callback);
  window.addEventListener(requestEvent, callback);
  return () => {
    window.removeEventListener("storage", callback);
    window.removeEventListener(requestEvent, callback);
  };
}

function read<T>(value: string | null): T | null {
  try { return value ? JSON.parse(value) as T : null; } catch { return null; }
}

function writeRequest(request: Request): boolean {
  if (!writeStorage("local", requestKey, JSON.stringify(request))) return false;
  window.dispatchEvent(new Event(requestEvent));
  return true;
}

export function useHandoff() {
  const raw = useSyncExternalStore(subscribe, () => readStorage("local", requestKey), () => null);
  const request = read<Request>(raw);
  return request && typeof request.id === "string" && (request.channel === "voice" || request.channel === "text") && Number.isFinite(request.deadline) && ["waiting", "connected", "failed", "ended"].includes(request.status) ? request : null;
}

export function endHandoff(id: string): boolean {
  const request = read<Request>(readStorage("local", requestKey));
  if (!request || request.id !== id || request.status !== "connected") return false;
  return writeRequest({ ...request, status: "ended" });
}

export function useRecentConsultation() {
  const raw = useSyncExternalStore(subscribe, () => readStorage("session", recentKey), () => null);
  const recent = read<Consultation>(raw);
  return recent && (recent.channel === "voice" || recent.channel === "text") && typeof recent.summary === "string" ? recent : null;
}

export function prepareHandoff(summary: string) {
  removeStorage("session", activeKey);
  writeStorage("session", draftKey, summary);
}

export function startPreparedHandoff(channel: Channel): boolean {
  return startHandoff({ channel, summary: readStorage("session", draftKey) ?? "" });
}

export function startHandoff(consultation: Consultation, messages?: ConsultationMessage[]): boolean {
  let id: string;
  try { id = crypto.randomUUID(); } catch { return false; }
  const historyId = consultation.historyId ?? id;
  if (!writeStorage("session", activeKey, JSON.stringify({ id, ...consultation, historyId }))) return false;
  if (!writeRequest({ id, channel: consultation.channel, deadline: Date.now() + timeoutMs, status: "waiting" })) {
    removeStorage("session", activeKey);
    return false;
  }
  removeStorage("session", draftKey);
  if (!consultation.historyId) {
    saveHistoryEntry({
      id: historyId, channel: consultation.channel, status: "unresolved",
      title: consultation.channel === "voice" ? "음성 상담" : "텍스트 상담",
      summary: consultation.summary,
      messages,
    });
  }
  return true;
}

export function getActiveConsultation() {
  if (typeof window === "undefined") return null;
  const active = read<Consultation & { id: string }>(readStorage("session", activeKey));
  return active && typeof active.id === "string" && (active.channel === "voice" || active.channel === "text") && typeof active.summary === "string" ? active : null;
}

export function settleHandoff(id: string, status: "connected" | "failed"): boolean {
  const request = read<Request>(readStorage("local", requestKey));
  if (!request || request.id !== id || request.status !== "waiting") return false;
  const expired = Date.now() >= request.deadline;
  if (expired !== (status === "failed")) return false;

  const active = getActiveConsultation();
  if (active?.id === id) {
    if (status === "failed") {
      if (!writeStorage("session", recentKey, JSON.stringify({ channel: active.channel, summary: active.summary, historyId: active.historyId }))) return false;
    } else {
      removeStorage("session", recentKey);
    }
  }
  return writeRequest({ ...request, status });
}

export function clearRecentConsultation() {
  removeStorage("session", recentKey);
}
