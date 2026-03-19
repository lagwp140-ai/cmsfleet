import { useOutletContext } from "react-router-dom";

import type { AdminConsoleContextValue } from "./console";

export function useAdminConsole() {
  return useOutletContext<AdminConsoleContextValue>();
}
