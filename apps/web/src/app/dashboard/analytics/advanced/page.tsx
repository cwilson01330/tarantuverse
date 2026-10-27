import { redirect } from "next/navigation";

// The Advanced page is now the Premium section of the one Analytics page.
// Old bookmarks and links land there, scrolled to it.
export default function AdvancedAnalyticsRedirect() {
  redirect("/dashboard/analytics#premium");
}
