import { consoleApi } from "../../../../lib/server/console-runtime";

export function GET(request: Request) {
  return consoleApi().queue(request);
}