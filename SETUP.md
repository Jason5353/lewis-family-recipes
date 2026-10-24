# Setting up Lewis Family Recipes

Everything here is free. About 20 minutes, once.

Keep it separate from BMS Cyber Defence: every name below starts with `lewis-`, and nothing here touches the BMS Pages project, DNS or tokens.

---

## 1. Put the site on Cloudflare Pages (5 min)

1. Cloudflare dashboard → **Workers & Pages** → **Create** → **Pages** tab → **Connect to Git**.
2. Pick GitHub. When GitHub asks which repositories Cloudflare can see, choose **Only select repositories** and add `lewis-family-recipes`.
   (If Cloudflare's GitHub app is already installed for the BMS repo, just add this repo to its list. Don't switch it to "All repositories".)
3. Select `lewis-family-recipes`, then set:
   - Project name: `lewis-family-recipes`
   - Production branch: `main`
   - Framework preset: **Astro**
   - Build command: `npm run build`
   - Build output directory: `dist`
4. **Save and Deploy.** After a minute the site is at `https://lewis-family-recipes.pages.dev`.

> If Cloudflare gives it a different address (e.g. `lewis-family-recipes-abc.pages.dev`), tell Claude so `astro.config.mjs` and the steps below can be updated.

**The site is public until step 3 is done.** It's hidden from search engines, but don't share the link yet.

---

## 2. Let the site save recipes to GitHub (5 min)

The "Add a recipe" button saves each recipe into this repo. It needs a key that can only touch this one repo.

1. GitHub → your photo → **Settings** → **Developer settings** → **Personal access tokens** → **Fine-grained tokens** → **Generate new token**.
   - Name: `lewis-family-recipes importer`
   - Expiration: 1 year (put a reminder in your calendar to renew it)
   - Repository access: **Only select repositories** → `lewis-family-recipes`
   - Permissions → Repository permissions → **Contents: Read and write**. Leave everything else as it is.
2. Copy the token (it starts `github_pat_`).
3. Cloudflare → **Workers & Pages** → `lewis-family-recipes` → **Settings** → **Variables and Secrets** → **Add**, for **Production**:

   | Type | Name | Value |
   |---|---|---|
   | Secret | `GITHUB_TOKEN` | the token you just copied |
   | Text | `GITHUB_REPO` | `Jason5353/lewis-family-recipes` |
   | Text | `GITHUB_BRANCH` | `main` |

4. **Deployments** → latest deployment → **⋯** → **Retry deployment**, so the settings take effect.

---

## 3. Lock it to the family (pick ONE option)

### Option A: Cloudflare Zero Trust (recommended)

Each person signs in with their own email and a 6-digit code. No passwords. "Added by" is filled in automatically.

**Create the Zero Trust team (one time):**
1. Cloudflare dashboard → **Zero Trust** (left menu).
2. Team name: `lewis-cl-zero`. This shows on the family's sign-in page.
3. Choose the **Free** plan (up to 50 users). Cloudflare asks for payment details even for the free plan. **You won't be charged.**

**Turn on email codes:**
1. Zero Trust → **Settings** → **Authentication** → **Login methods**.
2. If **One-time PIN** isn't listed, click **Add new** → **One-time PIN** → **Save**. (Without it, only people with Cloudflare accounts could sign in.)

**Protect the site:**
1. Zero Trust → **Access** → **Applications** → **Add an application** → **Self-hosted**.
2. Name: `Lewis Family Recipes`. Session duration: **1 month** (so people don't have to keep signing in).
3. Add two public hostnames:
   - `lewis-family-recipes.pages.dev`
   - `*.lewis-family-recipes.pages.dev` (covers preview builds)
4. Add a policy: name `Family`, Action **Allow**, Include → **Emails** → add each family member's email address.
5. Login methods: tick **One-time PIN** only. Save.

**Let phones install the app icon** (needed for the Android Share button):
1. **Add an application** → **Self-hosted** again. Name: `Lewis Recipes app icon (public)`.
2. Public hostnames, with paths:
   - `lewis-family-recipes.pages.dev`, path `manifest.webmanifest`
   - `lewis-family-recipes.pages.dev`, path `icons/*`
3. Policy: name `Public`, Action **Bypass**, Include → **Everyone**. Save.

   (These are only the app name and the "L" icon. No recipes or photos.)

**Tell the site who's who:**
1. Pages project → **Settings** → **Variables and Secrets** → add a **Text** variable for Production:
   - Name `FAMILY_EMAILS`
   - Value (edit the emails):
     ```json
     {"jason@example.com":"Jason","rachael@example.com":"Rachael","jasmine@example.com":"Jasmine","alex@example.com":"Alex","pauline@example.com":"Pauline"}
     ```
2. Retry the latest deployment.

### Option B: Shared family password (no card needed)

1. Pages project → **Settings** → **Variables and Secrets** → add a **Secret** for Production: `SITE_PASSWORD` = a long family password.
2. Retry the latest deployment.

Everyone signs in once with their name and the password. They stay signed in for a year on that device.

---

## 4. Try it

1. Open the site → **+ Add a recipe** → paste `https://www.bbcgoodfood.com/recipes/honey-chicken` → **Add recipe**.
2. Wait about a minute and refresh. It should be on the home page with your name on it.
3. Set up phones: open `/help/` on the site and follow the Android or iPhone steps.

---

## Day to day

- **Add a recipe:** Share button on the phone, or paste a link on the Add page.
- **Fix or delete a recipe:** on GitHub, open `src/content/recipes/`, click the recipe's file, then the pencil (edit) or bin (delete). The site updates in about a minute.
- **Add a person:** add them to `src/data/family.json` and, with Zero Trust, to the `Family` policy and `FAMILY_EMAILS`.
- **Add a category:** add it to the `categories` list in `src/data/family.json`.
- **Family photos:** in `public/family/`, listed with captions in `src/data/snapshots.json`.

## If something goes wrong

| What you see | What to do |
|---|---|
| "The importer is not set up yet" | Step 2 isn't finished, or the deployment wasn't retried afterwards. |
| "Saving to GitHub failed: GitHub 401" | The GitHub token has expired or was pasted wrongly. Make a new one (step 2). |
| "That site wouldn't let us in" | Some sites block automated visits. Try the same recipe from another site, or ask Claude to add it by hand. |
| "doesn't have recipe details we can read" | The link is probably an article or video page, not the recipe page itself. |
| Android doesn't show Lewis Recipes in Share | Check the "app icon (public)" Access application exists, then remove the home-screen app and install it again. |

## Free plan limits (for reference)

- Cloudflare Pages: 500 builds a month. Each added recipe uses one.
- Pages Functions: 100,000 requests a day.
- Zero Trust: up to 50 people.
