import { MessageCircle } from "lucide-react";
import { whatsAppUrl } from "../lib/whatsapp";
import { Button, ButtonLink } from "./ui";

type WhatsAppLinkProps = {
  phone: string | null;
  patientName: string;
  className?: string;
};

export const WhatsAppLink = ({ phone, patientName, className }: WhatsAppLinkProps) => {
  const href = whatsAppUrl(phone);

  if (!href) {
    return (
      <Button variant="outline" disabled className={className} title="No phone number on file">
        <MessageCircle size={15} />
        WhatsApp
      </Button>
    );
  }

  return (
    <ButtonLink
      variant="outline"
      href={href}
      target="_blank"
      rel="noopener noreferrer"
      aria-label={`WhatsApp ${patientName} (opens in a new tab)`}
      className={className}
    >
      <MessageCircle size={15} />
      WhatsApp
    </ButtonLink>
  );
};
