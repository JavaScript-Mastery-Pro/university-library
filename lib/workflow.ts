import { Client as WorkflowClient } from "@upstash/workflow";
import { Client as Qstash, resend } from "@upstash/qstash";

import config from "./config";

export const workflowClient = new WorkflowClient({
  baseUrl: config.env.upstash.qstashUrl,
  token: config.env.upstash.qstashToken!,
});

export const qstashClient = new Qstash({
  token: config.env.upstash.qstashToken!,
});

export const sendEmail = async ({
  email,
  subject,
  message,
}: {
  email: string;
  subject: string;
  message: string;
}) => {
  await qstashClient.publishJSON({
    api: {
      name: "email",
      provider: resend({ token: config.env.resendToken! }),
    },
    body: {
      from: "Acme <onboarding@resend.dev>",
      to: [email],
      subject,
      html: message,
    },
  });
};
