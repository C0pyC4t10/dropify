import { redirect } from "next/navigation";

/**
 * /companies was the original per-tenant switcher. After Dropify's
 * multi-tenant refactor, full company management lives at /admin/companies.
 * This server component redirects any old links (header, footer, bookmarks)
 * straight to the new admin page.
 */
export default function CompaniesLegacyPage() {
  redirect("/admin/companies");
}
