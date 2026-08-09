import Hero from "@/components/Hero";
import RsvpSection from "@/components/Rsvp/RsvpSection";
import SiteFooter from "@/components/SiteFooter";

/**
 * PADRE65 — AFTER HOURS
 *
 * Two screens and a footer: the invitation, then the reply. All copy comes
 * from config/event.ts.
 */
export default function InvitationPage() {
  return (
    <>
      <a className="skip-link" href="#main">
        Skip to content
      </a>

      <main id="main">
        <Hero />
        <RsvpSection />
      </main>

      <SiteFooter />
    </>
  );
}
