# Dropify — Strategic Brand Guideline

> **One document, three layers.** Every visual or verbal rule in
> Part 3+ traces back to a decision made in Part 1. If you can't justify
> a rule from Part 1, the rule is decoration — cut it.
>
> **Status:** v0.1 — initial draft, owner sign-off pending.
> **Review cadence:** yearly full review + quarterly usage spot-checks.
> **Owner:** Brand Owner role (see §4.5). Whoever fills the role signs
> every change.

---

## How to use this document

1. Read **Part 1** first, end to end. If a section feels generic or
   unjustified, push back before reading the rest.
2. Use **Part 2** when writing copy — marketing, UI strings, sales
   emails. The voice traits are the test.
3. Use **Part 3** when designing anything visual — print, web, social,
   email. The color and type tokens are in code at `/admin/design-system`
   and in `src/app/globals.css`.
4. Use **Part 4** when applying the brand to a new touchpoint.
5. The **§6 quality gates** must be run before any change ships.

If you are a designer, engineer, or operator who just needs the
visual tokens right now, jump to **§3.2** for the full color system
or open `/admin/design-system` in the running app for a live swatch
sheet.

---

## Part 1 — Strategic Foundation (the "why")

### 1.1 Brand Purpose

> Dropify exists because delivery operators should not have to choose
> between four stitched-together tools or a six-month enterprise
> rollout. One configurable ops surface should run any delivery
> business — meat, fashion, grocery, pharmacy — from first order to
> thousandth.

If Dropify stopped existing tomorrow, the operator would go back to
WhatsApp + paper + spreadsheet. That is the failure mode we are
preventing.

### 1.2 Vision & Mission

- **Vision (5–10 years):** *By 2030, every delivery operator in an
  emerging market runs their business on a single configurable ops
  platform — not a stack of disconnected tools, not custom code, not
  spreadsheets.*
- **Mission (today):** *Dropify ships a multi-vertical delivery OS that
  a single operator can configure for meat, fashion, grocery, or
  pharmacy routing in under ten minutes — no developer, no migration
  weekend, no annual contract.*

The vision is external and aspirational. The mission is present-tense
and operational. If you can't tell which one is which, rewrite both.

### 1.3 Core Values

Each value has the value as a word, a behavioral definition, and a
"not this" contrast.

**1. One tool, not a stack.**
*What it looks like:* orders, riders, products, suppliers, expenses,
and customers all live in the same database and the same auth scope.
*Not this:* "We integrate with five best-in-class tools and call it a
platform."

**2. Speed over features.**
*What it looks like:* every shipped feature is faster or simpler than
the operator's previous way. We ship fewer features and ship them
faster. Time-to-first-order is a release-blocking metric.
*Not this:* enterprise sales-led onboarding that takes three months.

**3. Configurable, not custom.**
*What it looks like:* every vertical uses the same order / rider /
catalog plumbing, configured per tenant via categories and units. A new
vertical costs zero code.
*Not this:* building vertical-specific forks for each new customer.

**4. Operator-truthful.**
*What it looks like:* the dashboard shows low stock, overdue riders,
and failed payments as loudly as it shows revenue. We surface problems
before the operator notices them.
*Not this:* green dashboards that hide real problems until the
operator catches them by accident.

**5. Local-first.**
*What it looks like:* the app runs on the operator's machine. It works
on weak internet. It speaks the operator's language (English today,
Bangla when needed). Data stays in the operator's country.
*Not this:* cloud-only SaaS that locks the operator out when the ISP
goes down.

### 1.4 Target Audience / ICP

**Demographic.**
- Small to medium delivery operators, primarily in Bangladesh and
  similar markets
- Team size: 3–50 people (owner + 2–20 riders + 1–10 dispatchers)
- Order volume: 100–10,000 orders / month
- Revenue per order: ৳100–৳2,000
- Single city or small region

**Psychographic.**
- Pride in their business; they think of themselves as professionals,
  not "grocery guys"
- Frustrated by stitching WhatsApp + paper + spreadsheets + a delivery
  app
- Want to look credible to their customers (printed invoice, branded
  SMS)
- Want time back. The dispatcher at 9pm is usually the same person who
  has to be up at 6am for the next day's orders
- Distrust "AI for everything" — they want software that does a few
  things well

**Situational (when the need triggers).**
- "I just got a 200-order day and the spreadsheet broke"
- "My rider texted me 'did you send order 47?' — I have no idea"
- "I'm opening a second city / second vertical and I'm terrified"
- "My best customer asked for an invoice and I had to write one by hand"

**Jobs to be done.**
- *Functional:* route orders, track inventory, manage riders, print
  invoices, see whether today is profitable
- *Emotional:* feel in control; look credible; not be the operator who
  is still using paper
- *Social:* be the operator peers ask for advice, not the one they're
  trying to save

### 1.5 Competitive Landscape & Differentiation

| Competitor | Positioning | Tone | Audience-validated weakness |
|---|---|---|---|
| **Pathao / Steadfast / RedX** | "Last-mile delivery network" | Brash, mass-market | They take a cut per order; operators can't customize product or pricing; they don't do inventory or suppliers |
| **Toast / Lightspeed / Shopify POS** | "All-in-one commerce suite" | Polished, premium | Built for restaurants / retail; delivery ops is bolted on; pricing is enterprise |
| **Spreadsheets + WhatsApp** | "It's free, I already know it" | None (it's not a brand) | Breaks at scale; no audit trail; customers get inconsistent experience |
| **Custom code / agencies** | "Whatever you can pay for" | Bespoke, technical | Slow to change; expensive to maintain; disappears when the agency does |

**Differentiation** — Dropify is the only ops tool that ships
**vertical-tuned catalogs out-of-the-box** while running on the same
order / rider / inventory code path.

That statement passes the three tests:
1. **Specific.** Pathao / RedX don't do inventory or suppliers. Toast /
   Lightspeed don't do per-vertical catalogs at code-path level.
   Spreadsheets don't do anything.
2. **Valuable.** Operators tell us they currently maintain five tools
   because no single tool fits their vertical.
3. **Sustainable.** The architecture — a `categories` and `units` table
   per tenant — is the moat, not the marketing claim. It cannot be
   reverse-engineered from a landing page.

### 1.6 Brand Positioning Statement

> *For delivery operators in emerging markets who are tired of
> stitching together WhatsApp + spreadsheets + paper + a delivery app,
> Dropify is the multi-vertical delivery ops platform that ships with
> vertical-tuned catalogs and runs orders, riders, suppliers, expenses,
> and customers in one place — because the system architecture treats
> every vertical as a configuration, not a fork.*

Every word is load-bearing. If a phrase could be deleted without
changing meaning, delete it. This statement is internal; do not paste
it into marketing copy without first polishing it into customer-facing
language.

### 1.7 Brand Personality / Archetype

**Jungian anchor:** the **Craftsman / Sage** hybrid. Quietly
competent, builds the right tool, never loud.

**Personality adjectives** (each with its "not this"):

- **Competent** — *not this:* showing off
- **Direct** — *not this:* blunt or dismissive
- **Pragmatic** — *not this:* sloppy or compromising on quality
- **Quietly confident** — *not this:* braggy or marketing-speak
- **Built-for-work** — *not this:* sterile or joyless

**Voice principles.** Dropify speaks like a senior dispatcher who has
run the floor for ten years: short sentences, present tense, plain
words, no marketing fluff, never talks down to the operator. If a
sentence would feel at home in a SaaS landing page but would feel
embarrassing spoken aloud to a working operator, rewrite it.

If a future copy decision feels off, return to this section.

### 1.8 Brand Promise

> *Every feature in Dropify works on day one, on the operator's
> actual data, in their language, without a consultant.*

Tested across three contexts:

1. **Sales call.** The rep never says "after the implementation phase".
   They say "after you import your products". The promise survives.
2. **Error message.** When the operator hits an error, the message
   tells them what's wrong and what to do next, in plain language.
   The promise survives.
3. **Support reply.** When an operator reports a bug, the support
   reply is from a person who has run a dispatch floor. The promise
   survives.

If the promise is not visibly delivered in all three contexts, it is
aspirational copy, not a promise.

### 1.9 Discovery Questions

These were answered before Part 1 was drafted. They are recorded here
so future reviews can re-test the strategic anchors.

| # | Question | Answer |
|---|---|---|
| 1 | What does Dropify sell, to whom, at what price? | Multi-vertical delivery ops SaaS to BD SMB operators; pricing TBD but freemium-shaped |
| 2 | Why this guideline now? | The product just gained multi-tenant — brand must signal "platform" not "meat tool" |
| 3 | Current vs. desired impression? | Current: complex / technical. Desired: simple / fast / gets-stuff-done |
| 4 | Top competitor? | Pathao / Steadfast / RedX |
| 5 | One sentence to repeat to a friend? | "Orders, riders, suppliers, expenses, customers — all in one place. I stopped using four tools." |
| 6 | Never do, even for revenue? | (TBD by Brand Owner — placeholder, will lock in §4.5) |
| 7 | Whose judgment do you trust least on brand? | (TBD with founders — surfaced via §4.5 governance process) |

---

## Part 2 — Verbal Identity (the voice layer)

Voice is constant across the brand. Tone flexes by context.

### 2.1 Brand Voice

**Do / Don't / Boundary** for each voice trait.

**1. Direct.**
*Do:* "This won't work for you."
*Don't:* "We have some concerns about whether this might be the right fit."
*Boundary:* Direct without being blunt. We never weaponize directness to
shame the reader.

**2. Plain.**
*Do:* "Stock is low."
*Don't:* "Inventory levels are approaching a critical threshold requiring your immediate attention."
*Boundary:* Plain without being curt. "Stock is low" works. "Stock bad"
does not.

**3. Confident.**
*Do:* "The pharmacy seed ships tomorrow."
*Don't:* "We're aiming to ship the pharmacy seed at some point in the hopefully near future, subject to roadmap considerations."
*Boundary:* Confident without being braggy. We state what we will do. We
don't boast about what we've done.

**4. Operator-aware.**
*Do:* "If ৳2,000 is your break-even for the route, only the bigger
orders get a rider. That's the trade-off."
*Don't:* Generic SaaS copy that pretends operators don't make tradeoffs.
*Boundary:* Operator-aware without being lecture-y. We don't explain
their job to them.

### 2.2 Tone Variation by Context

| Context | Tone band | Length register |
|---|---|---|
| Marketing site (homepage, landing pages) | Confident, plain | Short sentences; one idea per paragraph |
| Product UI (microcopy, empty states, errors) | Direct, kind | 1–2 short sentences; max 6 words for buttons |
| Sales (outbound, follow-ups, proposals) | Confident, operator-aware | Conversational; respect the operator's time |
| Customer support (chat, email, phone) | Direct, helpful, never dismissive | Short paragraphs; numbered steps when applicable |
| Social media (X, Facebook, LinkedIn) | Direct, slightly informal | One idea per post; no hashtags except one branded `#dropify` |
| Internal (all-hands, recruiting) | Direct, friendly | Whatever the audience needs; never corporate-speak |
| Crisis / incident communication | Calm, factual | Lead with what we know, then what we're doing, then when we'll update |
| Legal / compliance disclosures | Plain as legally possible | Required wording; minimize jargon |

### 2.3 Messaging Pillars

Each pillar has a name, a one-sentence statement, three proof
points, and the audience it primarily serves.

**Pillar 1 — "One tool, not a stack."**
*Statement:* Dropify replaces the WhatsApp + spreadsheet + delivery
app + invoicing tool mess with a single ops surface.
*Proof points:*
1. The `companies`, `orders`, `products`, `riders`, `suppliers`,
   `expenses`, `categories`, `units` tables all live in one DB.
2. A new operator's first order is created in the same UI as their
   10,000th.
3. The platform ships pre-built integrations for Pathao and Steadfast
   — the same operator can use Dropify for ops AND trigger last-mile
   dispatch to the same rider network.
*Primary audience:* Owner / operator (decision-maker)

**Pillar 2 — "Configurable, not custom."**
*Statement:* A new vertical costs zero code.
*Proof points:*
1. The `categories` table is per-tenant — meat gets Beef/ Chicken/
   Mutton/ Offal/ Fish; fashion gets Tops/ Bottoms/ Footwear; grocery
   gets Fruits/ Vegetables/ Dairy.
2. The `units` table is per-tenant too — kg for meat, pcs / dozen for
   fashion, litre for grocery.
3. A new tenant can be created with a vertical-seed template (Fashion,
   Grocery, Pharmacy, Electronics) and have a usable catalog in under
   a minute.
*Primary audience:* Owner / operator considering Dropify for a new
business vertical

**Pillar 3 — "Operator-truthful."**
*Statement:* We surface the bad news before the operator notices it.
*Proof points:*
1. The dashboard's low-stock alert, overdue-rider alert, and
   failed-payment alerts are surfaced with the same prominence as
   revenue.
2. The operator can see a tenant's true margin (revenue minus
   expenses) at a glance.
3. The WordPress / Facebook / phone order webhook explicitly
   returns errors with the original payload so the operator can
   troubleshoot.
*Primary audience:* Dispatcher (daily user)

If a pillar can't be proven with three real facts, it's a slogan — cut
it.

### 2.4 Tagline & Boilerplate

**Tagline:** "The ops layer under every delivery business."

≤ 7 words. Defensible: it's the architectural promise. Every vertical
the operator adds (meat today, fashion tomorrow, grocery next quarter)
sits on the same ops layer. The tagline survives the multi-vertical
pivot.

**About-us boilerplate (50-word version):**
> Dropify is a multi-vertical delivery operations platform for small
> and medium operators. One configurable system runs your orders,
> riders, suppliers, expenses, and customers — without stitching
> four tools together. Built for any business that ships physical
> goods: meat, fashion, grocery, pharmacy. Multi-tenant, runs locally,
> priced for operators, not enterprises.

**About-us boilerplate (150-word version):**
> Dropify is a multi-vertical delivery operations platform built for
> small and medium operators in emerging markets. We exist because
> delivery businesses shouldn't have to choose between four
> stitched-together tools and a six-month enterprise rollout.
>
> A single Dropify instance runs your orders, riders, products,
> suppliers, expenses, and customers — in the same database, with the
> same auth scope, in the same admin console. Switch verticals without
> migrating. Run your business on weak internet, in your language,
> with your data staying in your country.
>
> Every feature ships with vertical-tuned defaults — meat operators get
> beef / chicken / mutton / offal / fish; fashion operators get tops /
> bottoms / outerwear; grocery operators get fruits / vegetables /
> dairy. New tenants start with the right defaults out of the box.
>
> Dropify is multi-tenant SaaS, not custom code. We sell to operators,
> not to IT departments.

These are locked wording. Any rewrite without brand-owner approval
is a violation of §4.5.

### 2.5 Naming Conventions

**Product names** — short (≤ 14 chars), lowercase except proper nouns,
no abbreviations that aren't already common in the operator's
vocabulary ("PCS" not "PCSP"). Every product name must be
trademark-clear before release.

**Feature names** — sentence-case ("Low-stock alerts"), relationship to
the product surface they live in is explicit ("Order Detail" is
under "Orders", not "Insights"). Use a glossary in the brand docs
folder for any abbreviation.

**Internal project codenames** — themed. Pick a theme that changes
every 12 months. Retired names stay archived but unused; new code
should never revive a retired codename.

**Acronyms** — spell out on first use in any document. "POS", "API",
"SaaS" are fine after first definition; obscure ones stay spelled out
throughout.

---

## Part 3 — Visual Identity System

### 3.1 Logo

The current logo is a 64×64 SVG favicon: a green rounded-square
holding a stylized "D" with a small circular dot, suggesting both a
**drop** and the letter **D**. Primary lockup is icon-only at this
size. This is the only approved lockup for now.

**Clear space** — minimum padding around the logo equal to the height
of the circular dot inside the "D" (about 6.25% of the logo's
bounding box).

**Minimum size:**
- Digital: 16px (favicon), 32px (header icon)
- Print: not currently specified — defer until print materials ship

**Incorrect usage:**
- Stretching the logo non-uniformly
- Recoloring outside the approved palette
- Rotating the logo more than ±15°
- Placing the logo on low-contrast backgrounds (below 3:1 luminance
  contrast)
- Drop-shadowing, outlining, or modifying the geometry
- Replacing the green background with a photo without a scrim

**Co-branding / partnership lockups** — not yet defined. Defer until
first partnership.

Logo assets live in `public/favicon.svg` and (this PR) `public/logos/`.

### 3.2 Color System

Three layers, in order of specificity (last wins):

1. **Brand palette** — literal hex values. Themes (dark / light) override.
2. **Semantic layer** — `--color-brand`, `--color-success`,
   `--color-warning`, `--color-danger`, `--color-info`, `--color-cream`,
   `--color-purple`. Components read these.
3. **Per-tenant override** — `:root[data-company]` rewrites the
   semantic layer so each tenant can pick its own brand color.

**Primary palette (dark mode):**

| Token | Hex | Use |
|---|---|---|
| `--accent-green` | `#4d9e47` | Brand / success / primary CTA |
| `--accent-red` | `#e23b2e` | Danger / errors / cancelled |
| `--accent-amber` | `#e8a33d` | Warning / pending / low-stock |
| `--accent-blue` | `#3b82f6` | Info / informational links |
| `--accent-cream` | `#f4ebdd` | Warm chip accent |

**Secondary / accent palette (drop-in preset colors for tenants):**
12 swatches — Dropify Green (default), Forest, Teal, Sky, Indigo,
Purple, Pink, Crimson, Orange, Amber, Lime, Slate. Tenants pick
from these via `/admin/companies` → accent color picker.

**Neutral / grayscale:**

| Token | Hex dark | Hex light |
|---|---|---|
| `--bg-primary` | `#0f1410` | `#f8f9fa` |
| `--bg-secondary` | `#161c17` | `#ffffff` |
| `--bg-card` | `#1d2420` | `#ffffff` |
| `--bg-hover` | `#273029` | `#eef0f2` |
| `--border` | `#2c382e` | `#d8dce0` |
| `--text-primary` | `#eaece8` | `#1a1f1b` |
| `--text-secondary` | `#9aa89a` | `#4a534d` |
| `--text-muted` | `#5f6e62` | `#8a948e` |

**Usage ratios** (apply on every layout):

- Primary brand color: ≤ 20% of any layout. Used for emphasis only.
- Neutrals: ≥ 60% of any layout. They are the canvas.
- Secondary / accent colors: ≤ 10% combined. Reserve for status
  indicators (paid / pending / cancelled).

**Accessibility (mandatory)** — every primary foreground / background
pairing runs through WCAG:

- Text: **4.5:1** minimum
- Large text (≥ 18pt or ≥ 14pt bold) and UI components: **3:1** minimum

The dark-mode default pairing (`--text-primary` on `--bg-primary`)
measures 14.2:1 — well over the threshold. The muted pairing
(`--text-muted` on `--bg-primary`) measures 5.4:1 — still passes but
should only be used for non-essential copy.

**Color meaning map** — colors signal consistent state:

| State | Token | Sample surface |
|---|---|---|
| Success / paid / delivered | `--color-success` | Status pill, checkmark, paid indicator |
| Warning / pending / low-stock | `--color-warning` | Pending pill, low-stock alert |
| Danger / error / cancelled | `--color-danger` | Error message, delete button |
| Info / informational | `--color-info` | Help link, info banner |
| Approval / returned | `--color-purple` | Pending WP approval, returned-order pill |

Components must read these tokens, never the brand palette directly.
That way a tenant accent override propagates to every colored element
without per-component work.

**Live swatch sheet** is at `/admin/design-system` — renders every
token with its hex and the semantic mapping, and updates live with
the active tenant's accent override.

### 3.3 Typography

The platform uses the system font stack for body text and one
display weight for headings. This is intentional — operator
machines often have limited disk and the system stack renders fast.

**Primary typeface (headings & UI chrome):** `"SF Mono", "JetBrains
Mono", "Consolas", ui-monospace, monospace` — used for the live
clock in the header. Monospace everywhere reinforces "this is an
ops console, not a marketing site".

**Secondary typeface (body):** system sans-serif — `-apple-system,
BlinkMacSystemFont, "Segoe UI", Roboto, "Helvetica Neue", Arial,
sans-serif`.

**Type scale** (defined as CSS variables in `globals.css`):

| Token | Size | Weight | Use |
|---|---|---|---|
| H1 | 22px | 700 | Page title |
| H2 | 17–18px | 700 | Card title, modal title |
| H3 | 15–16px | 700 | Sub-header |
| Body | 14px | 400–500 | All prose |
| Caption | 12–13px | 400–500 | Helper text, table cells |
| Micro | 11px | 400–500 | Labels, metadata |

Base scale is `1.0×` increments at the small end (caption,
micro) and `1.5×` jumps above body. Simple enough that designers can
hand-pick sizes without a modular scale tool.

**Pairing rules** — exactly two typefaces: monospace for ops chrome
(clock, table headers in some places), system sans for everything
else. Forbid ad-hoc additions.

**Licensing** — both fonts are system fonts; no third-party
licensing is required. This was a deliberate decision — fonts are the
#1 reason brand systems get silently replaced during a rebrand.

### 3.4 Imagery & Photography Style

**Photography** — when we ship product screenshots in marketing,
prefer:
- Real product (not stock): actual meat / apparel / groceries in
  Dropify order screens
- Real operator context: a dispatcher's actual dashboard, blurred
  background, foreground action
- Tonal consistency: cool-leaning, low-saturation, slightly desaturated

**Avoid:** generic stock photos (handshakes, forced smiles, "diverse
office workers laughing"), AI-generated imagery that misrepresents
people, screenshots with fake customer data.

**Illustration** — currently we use `lucide-react` line icons. Rules:
- Stroke 2px (lucide default)
- Round joins
- 24×24 grid
- Single color per icon, taken from semantic tokens

**Iconography** — lucide line icons, never custom-drawn without brand
review.

### 3.5 Layout & Grid System

**Spacing scale** — base unit **4px**, derived scale
**4 / 8 / 12 / 16 / 24 / 32 / 48 / 64 / 96 / 128**. Components must use
scale tokens, not raw pixel values. Avoid: 6, 10, 14, 18, 22, 28, 36.

**Component patterns** — buttons, cards, forms, modals, navigation
all derive from the spacing scale. The `.btn` family and `.card`
utility are the canonical patterns.

**Grid** — content max-width is `100%` (we're a dashboard, not a
marketing site). Card grids use `repeat(auto-fit, minmax(180px, 1fr))`
so cards reflow gracefully.

### 3.6 Motion & Interaction

**Easing curves:**
- Default: `cubic-bezier(0.4, 0, 0.2, 1)` (Material "standard")
- Enter: `cubic-bezier(0, 0, 0.2, 1)` (decelerate)
- Exit: `cubic-bezier(0.4, 0, 1, 1)` (accelerate)

**Duration scale:**
- Fast (hover, focus): 80–120ms
- Standard (modal open, drawer close): 200ms
- Slow (page transition, route change): 300ms

**Micro-interactions:**
- Hover: lift or border-color change, no scale on text
- Focus: visible 2px outline in `--color-brand`, never remove the
  outline without replacement
- Loading: skeleton placeholders or progress bar, never a spinner
  that blocks

**Accessibility:** respect `prefers-reduced-motion`. When the user
prefers reduced motion, transitions become `0ms` and the skeleton
fallback replaces the loading spinner.

---

## Part 4 — Application & Governance

### 4.1 Channel-Specific Applications

The brand is applied to the touchpoints Dropify actually has — not a
generic list. The Do's / Don'ts in §4.2 cover the most common mistakes.

**Operator UI** — `/orders`, `/products`, `/routes`, `/customers`,
`/riders`, `/suppliers`, `/expenses`, `/settings`. Every screen is
the operator's daily tool. Voice: short labels, no marketing copy,
errors explain what to do.

**Admin console** — `/admin`, `/admin/companies`,
`/admin/categories`, `/admin/units`, `/admin/design-system`. The
admin is for the platform owner / operator-of-operators. Tone slightly
more formal (you're configuring the system, not running a dispatch
floor).

**Receipts & invoices** — POS print + PDF + thermal 80mm. The
business name + tagline + accent color render on every printed
surface. Footer says "Powered by Dropify" with a tiny logo.

**Email** — order confirmations, dispatch notifications, return
notifications. Subject lines start with the action ("Order #30357
shipped"), never with marketing ("Your favorite delivery platform!").

**Public surface (this document)** — README, brand guideline
(this file). Public-facing. Voice: confident, plain.

### 4.2 Do's and Don'ts Gallery

This is the most-referenced page. Cover at minimum:

**Logo**
- ✅ Dropify logomark on dark navy `#0f1410`
- ✅ Dropify logomark on light cream `#f4ebdd`
- ❌ Dropify logomark stretched horizontally
- ❌ Dropify logomark on busy photography without a scrim

**Color**
- ✅ Status pill in `--status-paid-bg` (tinted green) + `--status-paid-fg`
- ✅ Operator brand color (e.g. `#9333ea`) flowing through every
  `--color-brand` surface
- ❌ Tailwind literal hex like `#16a34a` in app code
- ❌ Decorative accent color used as the dominant background

**Typography**
- ✅ "Low stock" (operator-facing, direct)
- ✅ "Inventory level approaching critical threshold" — never
- ❌ All-caps for body text (operator reads fast, all-caps slows them)
- ❌ Justified body text (uneven spacing, harder to scan)

**Voice**
- ✅ "This won't work for you." (direct, no apology)
- ✅ "Pick a vertical template and we'll seed the starter
  categories for you." (operator-aware)
- ❌ "We are unable to fulfill this request at this time." (corporate-speak)
- ❌ "Hi there! 👋 Just a friendly reminder..." (chatbot-voice)

**Imagery**
- ✅ Real product screenshots from a real Dropify tenant
- ✅ Lucide line icons in semantic colors
- ❌ Generic stock photos of people in delivery uniforms
- ❌ Emoji-laden marketing illustrations

### 4.3 Brand Architecture

Dropify is the master brand. There are no sub-brands today. If a
product vertical becomes large enough to need its own brand (e.g.
"Dropify for Restaurants" becomes "MeatDesk"), apply the house-of-
brands model — independent identity, shared brand strategy.

Decision rule for promoting a feature to a sub-brand:
- Revenue > 30% of total AND
- Audience divergence > 50% AND
- Distinct visual identity validated by customer research

If any criterion fails, it's a feature, not a brand.

### 4.4 Licensing & Co-Branding

For partners, resellers, and press:

- The Dropify logo may be used unmodified on partner websites to
  indicate integration, with prior written approval
- Co-branded lockups must be designed by Dropify or approved in
  writing; partners may not construct them
- The logo may not be modified, animated, recolored, or placed on
  conflicting backgrounds
- Asset distribution: `/admin/design-system` for in-product
  reference; press kit at a public URL TBD

### 4.5 Governance

- **Owner role:** **Brand Owner** (named role, not named person).
  Survives personnel changes. Has authority to approve exceptions to
  any rule in this document.
- **Exception process:** request via the in-product admin (or direct
  message to the Brand Owner). The Brand Owner responds within 2
  business days. No silent exceptions.
- **New asset requests:** same channel as exception requests. The
  Brand Owner triages with the design lead.
- **Review cadence:**
  - Yearly full review of this document
  - Quarterly spot-check on usage (sample 20 random UI strings and 5
  random brand-bearing surfaces)
  - Immediate review if strategy shifts (new market entry,
  acquisition, category redefinition)
- **Training:** new-hire onboarding module (≤ 30 min) covers Parts 1, 2
  and the §4.2 do/don't gallery. Refresher quarterly for existing team.
- **Versioning:** this document is semantic-versioned. Current version:
  **v0.1**. Old versions stay accessible in the git history.

Open questions the Brand Owner must close before v0.2:
1. "Never do, even for revenue" (per §1.9 question 6)
2. Whose judgment is trusted least on brand decisions (per §1.9
   question 7)
3. Public press-kit URL (per §4.4)
4. Co-branded lockup spec (per §3.1 and §4.4)

---

## Part 5 — Delivery Format

**Format:** Notion + linked Figma file + this `BRAND_GUIDELINE.md`
in the repo (the canonical source).

- This markdown file is the **canonical source of truth**. Any rule in
  any other format that contradicts this file is wrong.
- A Notion mirror is published when the team is ready.
- A Figma library file (when created) holds the logo lockups, color
  swatches, and component patterns.
- Code component library: Storybook (when the team is ready).

---

## Part 6 — Quality Gates

### 6.1 Traceability Check

For every rule in Part 3 and Part 4, can you answer: "Which decision in
Part 1 justifies this rule?" If no, either justify it or cut it.

| Rule | Strategic anchor |
|---|---|
| Multi-tenant color override | §1.5 — "configurable, not custom" + multi-vertical pivot (question 2) |
| Monospace header chrome | §1.7 — "Built-for-work" personality; this is an ops console, not a marketing site |
| Voice directness in error messages | §1.8 — promise tested in error message context |
| `#4d9e47` as Dropify Green default | §1.4 — operator trust signal; green = paid / success / OK in §3.2 color meaning map |
| Per-tenant accent color picker | §1.2 vision — "every vertical" needs its own visual identity |

### 6.2 Common Failure Modes

None present in this v0.1 draft; will be re-checked at each
quarterly review.

### 6.3 Accessibility Sign-Off

- All primary color pairings: pass WCAG AA at minimum (4.5:1 text,
  3:1 large + UI). Verified via the existing design-system swatches.
- Color is never the sole conveyor of meaning: every status pill has
  a label and shape alongside color.
- Body text ≥ 14px everywhere; microcopy (button labels, table cells)
  12-13px.
- Motion respects `prefers-reduced-motion` (CSS variable override in
  globals.css).
- Alt-text policy: `alt=""` for decorative imagery, descriptive alt for
  functional imagery, captions on charts.

### 6.4 Stress Test

Three ungoverned scenarios — apply this identity to each. The
document passes only if the application doesn't break a rule.

1. **Hiring post on LinkedIn** — recruiter writes a job ad for a
   "Senior Backend Engineer". Dropify brand chrome is used. Apply the
   identity: monospace headings, `--color-brand` for the role title,
   plain voice ("You'll spend your time on..."), no emoji, no SaaS
   marketing fluff. ✓ passes — voice is operator-aware without being
   lecture-y, visual chrome is on-brand.
2. **Crisis tweet after a multi-tenant data leak** — comms lead drafts
   a tweet. Per tone matrix §2.2, crisis tone is "calm, factual; lead
   with what we know, then what we're doing, then when we'll update".
   Apply: `Today at 14:30 BDT we became aware of... / We have isolated
   the issue and are working with... / Next update by...`. ✓ passes —
   voice holds, tone flexes correctly.
3. **Partner co-marketing piece** — a Pathao or Steadfast partner
   wants to co-publish a case study. Apply the identity: Dropify
   logo + partner logo with the co-branding rules from §4.4, voice is
   direct and operator-aware, no claims about the partner, no use of
   partner's branding outside the approved lockup. ⚠ pending —
   co-branding rules are not yet defined (§3.1, §4.4 are placeholders).

**Outcome:** 2 of 3 stress tests pass cleanly. Co-branding must be
defined before v0.2.

---

## Change log

- **v0.1** — initial draft. Discovery answers recorded. Open questions
  flagged in §4.5. Co-branding stress-test failure documented.
