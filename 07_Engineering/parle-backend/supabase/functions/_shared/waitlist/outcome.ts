/** What a refused send means (pure; ruling 13). status 0 = no answer (network). attempts counts this try. */
export function sendOutcome(status: number, attempts: number): "defer" | "fail" | "retry" {
  if (status === 429) return "defer";
  if (status >= 400 && status < 500) return "fail";
  return attempts >= 3 ? "fail" : "retry";
}

export function failureReason(status: number): string {
  if (status === 422) return "The address was refused by the mail service (422).";
  if (status === 403) return "Sending from hello@parle.buzz was refused (403). Check the parle.buzz domain in Resend.";
  if (status >= 400 && status < 500) return `The mail service refused this email (${status}).`;
  return "The mail service did not answer after 3 tries.";
}
