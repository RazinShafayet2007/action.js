import { defineError } from "@action-js/core";

export const UnauthorizedError = defineError("UNAUTHORIZED", {
  status: 401,
  message: "Authentication required",
});

export const ForbiddenError = defineError("FORBIDDEN", {
  status: 403,
  message: "You do not have access to this resource",
});
