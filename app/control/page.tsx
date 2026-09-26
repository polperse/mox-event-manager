import { headers } from "next/headers";
import { requireChatGPTUser } from "../chatgpt-auth";
import ControlClient from "./control-client";

export const dynamic = "force-dynamic";

export default async function ControlPage() {
  const requestHeaders = await headers();
  const host = (requestHeaders.get("host") ?? "").split(":")[0];
  const isLocal = ["localhost", "127.0.0.1", "terminal.local"].includes(host);
  if (!isLocal) await requireChatGPTUser("/control");
  return <ControlClient />;
}
