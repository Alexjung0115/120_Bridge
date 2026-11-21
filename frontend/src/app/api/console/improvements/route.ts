import { improvementsApi } from "../../../../lib/server/console-runtime";

export function GET(request: Request) {
  return improvementsApi()(request);
}
