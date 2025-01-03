"use client";

import ConfirmationDialog from "./ConfirmationDialog";

const AccountConfirmation = ({ user }: { user: User }) => {
  const confirmationAction =
    user.status === "PENDING" || user.status === "REJECTED"
      ? "approve"
      : "deny";

  const title =
    confirmationAction === "approve"
      ? "Approve Account Request"
      : "Deny Account Request";

  const description =
    confirmationAction === "approve"
      ? "Approve the student’s account request and grant access. A confirmation email will be sent upon approval."
      : "Denying this request will notify the student they’re not eligible due to unsuccessful ID card verification.";

  const triggerLabel =
    confirmationAction === "approve" ? "Approve Account" : "Revoke Account";

  const confirmLabel =
    confirmationAction === "approve"
      ? "Approve & Send Confirmation"
      : "Deny & Notify Student";

  const iconSrc =
    confirmationAction === "approve"
      ? "/icons/admin/info.svg"
      : "/icons/admin/tick.svg";

  return (
    <ConfirmationDialog
      variant={confirmationAction}
      title={title}
      description={description}
      triggerLabel={triggerLabel}
      onConfirm={() => {}}
      confirmLabel={confirmLabel}
      iconSrc={iconSrc}
    />
  );
};

export default AccountConfirmation;