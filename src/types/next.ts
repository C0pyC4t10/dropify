// Runtime shim re-exports for Next.js hooks so we can import them from a
// single path. The `.d.ts` declarations live next to this file.
export {
  useRouter,
  usePathname,
  useSearchParams,
  useParams,
  redirect,
  notFound,
} from "next/navigation";
