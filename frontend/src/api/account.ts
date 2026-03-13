import { authFetch } from "./client";

type DeleteMeResponse = {
  result: {
    status: string;
    message: string;
  };
};

export async function deleteCurrentUserAccount() {
  return authFetch<DeleteMeResponse>("/me", {
    method: "DELETE",
  });
}
