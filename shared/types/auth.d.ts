import type { SessionUser } from "../utils/schema";

declare module "#auth-utils" {
  interface User extends SessionUser {}
}

export {};
