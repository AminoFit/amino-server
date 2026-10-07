# People and sharing plan (friends, partners, trainers)

**Date:** 2026-10-07
**Status:** plan, nothing built. Owner decisions 2026-10-07: remove silently; the logger's subscription is checked; same amounts for everyone, each person edits their own portion (no per-person portions in the For sheet); no trainer diary view for now (maybe later in the web UI). Maximum reuse of shared helpers and components. Other **(decide)** items are open.
**Scope:** amino-server (database, API, meal agent, MCP, push) and amino-mobile (Settings › People, Foods tab, Add Food, Log).

Four things, built in this order:

1. **Copy links.** Any food or recipe can be shared as a link. Opening it adds a copy to your own foods. No relationship needed.
2. **People.** Link with another Amino user as a friend, partner or trainer. Both people opt in. Find people by QR code, invite link or email.
3. **Live sharing.** Share a food or recipe with linked people. They see it in their Foods as "From Sam", and it follows Sam's edits. It isn't a copy.
4. **Logging for each other.** Log a meal into someone else's diary when they've allowed it, for a trainer doing meal prep or partners eating the same dinner. Their log shows a person mark and "Logged by Sam". Any of your foods it uses are shared with them automatically.

The MCP server gets the same powers, so a trainer can use Claude to share and log across a whole roster.

---

## What exists today (and what it means here)

| Fact | Where | Consequence |
|---|---|---|
| A food is catalogue (`privateToUserId IS NULL`) or one user's (`= me`). The rule is copied into ~15 places. | RLS `20260927010000_private_foods.sql:20`; `search_meal_food_catalogue`, `get_cosine_results`, `search_food_catalogue_nearest`, `search_own_foods`, `save_user_food`, `log_food(s)_as_meal`, `agent_add_meal_foods`, `userFoods.ts:88`, `evidence.ts:89`, `foodSources.ts:232`, `packageBarcodes.ts`, `update-logged-food-item-serving` | One helper has to replace all of them before sharing, or a missed copy leaks or hides foods. |
| Editing a food that has logs or is used as an ingredient makes a **new row**: the old row is archived and the new one points back with `previousVersionId`. `in_use` counts **any** user's logs. | `save_user_food` | A live share can't point at a row id. It needs a stable id that every version has: a **lineage**. |
| Logged rows store their own nutrients. | `LoggedFoodItem`, `insert_priced_food_row` | Past meals never change when a shared food changes. Live sharing only affects what you log next, which matches owner decision 3 (edits apply going forward). |
| There is no sync protocol. The app pulls through PostgREST with the user's session, so RLS does the scoping. `syncUserFoods` pulls `privateToUserId = me` by a `lastUpdated` cursor. | `watermelon/syncLoggedFoodItem.ts:684` | Shared foods need their own pull. A new share of an old food has an old `lastUpdated`, so the share needs its own cursor. |
| The phone's write gate drops other users' meals and foods, and `users` rows that aren't you. | `applyRefreshChanges` 241/276/284/285 | Keep it. Never cache other people's meals in Watermelon. Shared foods pass, because the gate only filters meals and logged foods. |
| Meal attribution exists only for agents (`agentClientId`, `agentName`), with a sparkles mark. | `mealWrites.ts:86`, `MessageRow.tsx:40`, `EditMessageView.tsx:240` | On-behalf logging copies this pattern with `loggedByUserId` / `loggedByName`. |
| The QR scanner, universal links (`/oauth/approve`, `/signin/approve`) and the approve-screen pattern already exist. | `ScanAgentCodeScreen.tsx`, `apple-app-site-association/route.ts`, `ApproveWebSignIn` | Invites reuse all of it. |
| Saving a push token **deletes the user's other tokens**: one device per user. Nothing acts on a tapped notification. | `notifications.ts:106-140`, `App.tsx:142` | Fix before notifications matter: the owner has two phones. |
| `users.fullName` exists, but nothing sets or shows it. Apple only sends the name once. | `ProfileSettings.tsx` | Linking needs a display name. |
| Account deletion deletes `FoodItem` **by `userId`** (who created it, which can include catalogue foods) and doesn't check errors. | `deleteUserAndData.ts` | Must be rewritten. It's wrong today, and with sharing it would break other people's logs. |
| A dev-only "Friends View" tab and fake Privacy cards exist. | `BottomTabNavigator.tsx:79`, `SettingsScreen.tsx:214-408` | Remove both when People ships. |

---

## Principles

1. **Both people opt in.** Nothing is shared, and nobody can log for anyone, until the other person accepts. Every permission is granted by the person whose data it touches, and they can revoke it at any time without asking.
2. **An invite never carries the inviter's own grants.** It can only *ask* ("Sam asks to log meals for you"). The inviter sets what they share after the link exists and they can see who accepted. A forwarded invite link therefore can't expose the inviter.
3. **Only the creator shares.** You can share your own foods. A food someone shared with you can't be passed on, though you can save a copy and share that (see "Re-sharing").
4. **Losing access never breaks your diary.** On unlink or unshare, anything of theirs you **used** becomes your own private copy. Anything you never used just disappears.
5. **Meals stay as eaten.** No sharing action changes the amounts or nutrients of an existing meal. One exception: a past meal's food reference can move to an identical private copy, and its numbers stay the same.
6. **All cross-user writes happen on the server** in SQL functions that check permission in the same transaction. RLS is widened for reads only, and only for food tables.
7. **Other people's profiles stay minimal.** Linked people see your display name and initials, nothing else: no email, goals, weight or log. The server works out timezones for you.
8. **One switch for the rollout:** FeatureFlag `people` (owner and the second user first), checked in SQL and the API. The app hides People when it's off.

---

## Data model

All new tables have RLS on, with reads through a narrow policy or a server function and writes by the server only. Every function gets `REVOKE … FROM PUBLIC, anon, authenticated` / `GRANT … TO service_role`. Agent tokens stay read-only (`is_agent_token()` restrictive policies on the new tables too).

### FoodItem additions

- **`lineageId int NOT NULL`**: the id of the first version. A new version copies it from its previous version. Backfill by walking `previousVersionId` to the root (a recursive CTE). Index `(lineageId) WHERE archivedAt IS NULL`. **Every share and every grant points at a lineage, never a row.** Resolving to "current" means the row with that lineage and `archivedAt IS NULL`.
- **`copiedFromLineageId int NULL`**: where a copy came from, for deduplicating copies and showing "Copied from Sam's". It is not a foreign key, so it can outlive the source.

### People

```
UserLink
  id uuid PK
  userLow uuid, userHigh uuid      -- ordered pair; UNIQUE (userLow, userHigh) WHERE endedAt IS NULL
  kind text                        -- 'friend' | 'partner' | 'trainer'
  trainerId uuid NULL              -- which side is the trainer when kind = 'trainer'
  createdAt, createdBy, endedAt, endedBy
  FKs to User ON DELETE CASCADE

LinkGrant                          -- one row per direction, so two per link
  linkId uuid FK CASCADE
  grantorId uuid, granteeId uuid   -- grantor = the person whose data it touches
  canLogForMe bool default false   -- grantee may log meals into grantor's diary
  shareAllFoods bool default false -- every food the grantor owns is shared with grantee (partners)
  canSeeMyLog bool default false   -- reserved for phase 6; unused until then
  updatedAt
  PK (linkId, grantorId)

LinkInvite
  id uuid PK
  tokenHash text UNIQUE            -- sha256 of a 128-bit token; the token itself is never stored
  inviterId uuid
  inviteeId uuid NULL              -- set for email requests (a known user); null for QR / link
  kind text, asksToLogForYou bool  -- what the inviter asks for; never grants
  channel text                     -- 'qr' | 'link' | 'email'
  createdAt, expiresAt (7 days; 15 min for an on-screen QR), acceptedAt, acceptedBy, declinedAt, revokedAt

UserBlock (blockerId, blockedId, createdAt)  PK both
```

**Kind is a label plus default grants**, not a rule. Each person can change their own grants at any time.

| Kind | Default grants, offered on the accept screen (each can be changed) |
|---|---|
| Friend | none; foods are shared item by item |
| Partner | both people: `shareAllFoods`, `canLogForMe` |
| Trainer | client → trainer: `canLogForMe` (later `canSeeMyLog`); trainer → client: nothing, the trainer shares item by item |

Clients can have several trainers, and trainers many clients. Up to 300 links per user.

### Sharing

```
FoodShare                          -- explicit live shares (the owner's intent)
  ownerId, recipientId, lineageId, createdAt, revokedAt, via ('app' | 'mcp'), agentClientId NULL
  PK (ownerId, recipientId, lineageId)

FoodAccess                         -- materialized "recipient can see lineage"; the only thing RLS checks
  recipientId uuid, lineageId int, ownerId uuid
  viaShare bool, viaRecipe bool, viaShareAll bool, viaLog bool
  grantedAt, updatedAt, revokedAt, hiddenAt (recipient hid it from their Foods)
  PK (recipientId, lineageId); index (recipientId, updatedAt); index (ownerId, recipientId)

FoodCopyLink                       -- phase 1 copy links
  tokenHash UNIQUE, ownerId, lineageId, createdAt, revokedAt, copies int
```

**Why materialize?** Access comes from four sources:

- an explicit share;
- being a private ingredient of a shared recipe;
- a partner's "share all";
- having been logged for you.

Computing that inside RLS on every food read would be slow and easy to get wrong. Instead, one function, `refresh_food_access(ownerId, recipientId)`, rebuilds the pair's rows from the sources and writes only the differences. Every change calls it in the same transaction: share, unshare, a recipe saved with new ingredients, a grant change, a log for someone, unlink. The rebuild covers one owner's foods for one recipient: hundreds of rows, under a millisecond.

**Visibility helper.** One `STABLE SECURITY DEFINER` function, used by RLS, every search function and every log function:

```sql
food_visible(p_user uuid, p_private_to uuid, p_lineage int) =
  p_private_to IS NULL
  OR p_private_to = p_user
  OR EXISTS (SELECT 1 FROM "FoodAccess" a
             WHERE a."recipientId" = p_user AND a."lineageId" = p_lineage AND a."revokedAt" IS NULL)
```

Every version of a lineage you can access is visible, so the old versions your past meals point at keep showing. The same rule covers `Serving`, `Nutrient`, `RecipeIngredient`, `FoodItemImages` and `FoodBarcode` through their food. A database test greps the migrations for the old inline rule, so no new copy of it sneaks in.

### Meals

- `Message.loggedByUserId uuid NULL REFERENCES "User" ON DELETE SET NULL`
- `Message.loggedByName text NULL`: a snapshot, so the label survives unlinking and account deletion.
- `Message.logGroupId uuid NULL`: shared by the meals created in one "log for several people" action. Used for duplicate checks and to show the logger what they logged.
- Agent attribution still works: a trainer's agent logging for a client sets `loggedBy*` **and** `agentClientId` / `agentName`, so the label reads "Logged by Sam via Claude".
- `MealChange` and the MCP change feed already fire on `Message` writes, so on-behalf meals show up for the recipient's own agent too.

### Profiles

`User.displayName text` (fall back to `fullName`). A name is required before you can create or accept a link: a one-field prompt the first time you open People. Avatar = initials on a colour derived from the user id. Photo avatars can come later.

Linked people are read **only** through `linked_people(p_user)`, which returns `{id, displayName, kind, myGrants, theirGrants, linkedAt}`. User RLS is not widened.

### Push

- `ExpoPushTokens`: keep one row per device (unique `key`) instead of deleting the user's other tokens.
- Add `src/push/notify.ts`: `notify(userIds, {type, title, body, data: {url}})`. It coalesces per recipient within 2 minutes ("Sam shared 12 recipes with you") and respects per-type settings (Settings › Notifications).
- `App.tsx`: a tapped notification opens `data.url` through the linking config.
- Also: add the missing `CRON_SECRET` check to `push-notifications-cron`.

---

## 1. Copy links (phase 1, no relationship needed)

**Flow.**

1. On your food or recipe: **Share › Copy link** → `https://www.amino.fit/f/<token>` in the iOS share sheet.
2. The recipient opens it. If the app is installed, the universal link opens **Add food** (`/f/*` is added to apple-app-site-association). It shows a preview using the shared components: `NutritionFacts`, `RecipeFoodsGroup`, portions, and "Shared by Sam".
3. **Add to my foods** → `POST /foods/copy-link/<token>/copy` → `copy_food_lineage(source, recipient)`. That function copies the **current** version into the recipient's private foods, with its servings, nutrients and partial nutrients. A recipe also copies every private ingredient. Catalogue ingredients stay references.
4. Without the app, the web page shows the name and "Open in Amino / Get the app", and no nutrition. It is `noindex`.

**Edge cases.**

- **Copying twice:** if the recipient already has a current food with `copiedFromLineageId` = source, show "You already have this · Open · Add another copy".
- **Ingredients you already have a copy of** are reused, not duplicated.
- **Name clash** with one of the recipient's foods (names are unique per owner): add " (Sam)", then " (Sam 2)".
- **Source deleted or archived:** "This food is no longer shared". **Owner turns the link off:** Share › "Turn off link". The token stops working, and existing copies stay.
- **Opening your own link:** opens your food.
- **Not signed in:** sign in, then come back to the preview (the token survives in route params).
- **A recipe holding foods shared with the owner by someone else:** refused (see "Re-sharing").
- **Abuse:** 30 copies per user per hour. Tokens are 128-bit, so they can't be guessed.
- **Icons:** the copy reuses the source's icon file. The `web_food_icon` leak note doesn't apply, because the recipient can already see the food.

**MCP:** `create_copy_link(food_id)` returns the URL, so an agent can hand links out.

---

## 2. People (phase 2)

### Finding someone

**Settings › People** goes in the General group, as a root-stack screen like Connected agents.

| Method | How | Notes |
|---|---|---|
| **QR code (in person)** | "Show my code" displays a QR for `https://www.amino.fit/link/<token>`, refreshed every 15 min. The other person taps "Scan code" (the existing VisionCamera scanner gains a third parser). | The main method. Works whatever email each person used. |
| **Invite link** | "Share invite link" opens the share sheet with a 7-day single-use link. | For remote people, and for anyone using Hide My Email. |
| **Email** | Type an email. The server looks for a **verified** `auth.users.email` match (case-insensitive) and creates an in-app request for that user. | Always answers "If they use Amino, they'll get your request" whether or not a match exists, so nobody can probe which emails have accounts. An Apple relay address (`@privaterelay.appleid.com`) only matches if you type the relay itself, so the screen suggests "Send an invite link instead". 10 lookups a day. |

### Accepting

The accept screen (`/link/<token>`, or a request in People) shows the inviter's name and initials, the kind ("Sam wants to be your trainer"), and what they ask for, as switches the invitee controls: "Let Sam log meals for you" (on when asked). The invitee also chooses whether to share all their foods (on by default for a partner). **Accept** / **Decline** / **Decline and block**.

- On accept, the link and both grant rows are created in one transaction. The inviter gets a push ("Alex accepted"), and People opens with Alex's page, where the inviter sets their own grants.
- **Accepting your own invite:** "This is your own invite".
- **Already linked:** open the existing link. If the invite asked for more than you've granted, offer to change your grants.
- **Expired, used or revoked:** "This invite has expired. Ask Sam for a new one".
- **Blocked either way:** the same generic "This invite isn't available".
- **Both people invite each other at the same time:** the second accept finds the active link (unique pair index) and merges.
- **Wrong person accepts a forwarded link:** they get only what they choose to grant. The inviter sees their name in "Alex accepted" and can remove them.

### A person's page

Name, kind, linked date, then two sections:

- **"What Alex can do":** your grants, as switches. Turning one off takes effect at once and needs no confirmation. Turning on `canLogForMe` asks for confirmation, like "Let agents make changes".
- **"What you can do":** their grants, read-only.

The page also lists what you've shared with them, and "Meals you logged for Alex". At the bottom, a destructive **Remove Alex**.

Asking for more ("Ask Alex to let you log meals") sends a request Alex accepts or declines. It is never automatic.

### Unlinking (either person, at any time)

Done in one server transaction, `end_link(linkId, actor)`:

1. Set `endedAt`, and clear both grants. Any log for the other person still in flight is refused, because the check is inside the log function.
2. **Detach both directions.** For each recipient and each lineage they can access from the other person, look at whether they **used** it:
   - **Used** means it appears in their logs, their favourites, their recipes' ingredients, or as a private ingredient of a recipe they logged.
   - **Used:** run `copy_food_lineage` to give them a private copy. Then point their favourites and **their own recipes' ingredients** at the copy.
   - **Never used:** the access row is revoked and the food disappears.
3. **Past meals.** Point their `LoggedFoodItem.foodItemId` rows from any version of that lineage to the copy. Nutrients stay untouched, so the meal reads and totals exactly as before. Old versions are copied as archived copies when logs used them, so a meal logged before Sam renamed the food keeps the old name.
4. Revoke the `FoodAccess` rows, and clear `hiddenAt`.
5. Meals each person logged for the other **stay** in the other's diary, still labelled "Logged by Sam". The logger can no longer see or change them.
6. **Silent** (owner, 2026-10-07): no push and no notice. The person just disappears from People.

The same detach logic runs for **unsharing one item** and for **turning off share-all**: copy if used, otherwise remove. Users get one rule to learn.

Detaching is idempotent: it runs per lineage and checks `copiedFromLineageId`, so a retry doesn't double-copy. It runs inside the meal-operation guard bypass (admin), so pointing meals at the copy isn't blocked by `operationOwned`.

### Blocking

Blocking ends any link (detach as above), declines pending invites both ways, and stops new requests. Lookups for a blocked person give the generic answer. Unblock is in People › Blocked.

---

## 3. Live sharing (phase 3)

### Sharing

On your food or recipe, **Share** opens a sheet (`AppBottomSheet`):

- "Copy link" (phase 1).
- **Linked people, each with a switch:** "Share with Alex". Partners with share-all show "Shared (all your foods)" with no switch.
- Below: "Shared with 2", with each person's name.

You can also share from a person's page ("Share foods…" picks several foods at once).

### What the recipient sees

- **Foods tab:** shared items sit in the same Recipes and Foods lists as their own, marked by a small person badge with the owner's initials and "From Sam" as detail. A selector pill at the top filters **All · Mine · From Sam · From Alex** (owner picked this, option A, 2026-10-07). The badge is the shared `PersonAvatar` (initials on a colour from the user id), also used in People and on log rows.
- **The food page** shows "Shared by Sam" plus the created date. There is **no Edit**: the existing owner check stays. The recipient gets **Save a copy** (makes it theirs, detached) and **Remove from my foods** (sets `hiddenAt`; Sam isn't told, and it comes back if Sam shares it again).
- **Favourite, log and add to your own recipe all work** like your own foods.
- **Search and Add Food:** shared foods rank after your own and before the catalogue, with the owner's badge. Two foods called "Oats" (yours and Sam's) are told apart by the badge.
- **The meal agent:** `search_own_foods` and the hydration paths include `FoodAccess` lineages (current versions, after your own; still behind `recipes_in_agent` for recipes). "Sam's protein oats" matches by name. Run the text and recipe evals before turning this on (cost estimate first, see eval budget).

### Following edits

The owner edits as today:

- **In place** if nobody has logged it or used it as an ingredient.
- **As a new version** otherwise. Other users' logs count, so a food a recipient has logged always gets a new version, and that recipient's history stays exact.

The recipient's Foods shows the current version of the lineage. Past meals keep their numbers (decision 3).

Extend `save_user_food`'s "move references to the new version" step, which only moves the owner's favourites today. It should also move the **favourites and recipe ingredients of every user with access**. That user's recipe values are then recomputed by `refresh_recipe_values` (every minute), the same as for the owner.

### Sharing a recipe shares its ingredients

`refresh_food_access` marks every **private ingredient** of a shared recipe `viaRecipe`. When the owner adds an ingredient, the save path calls it for each recipient, so the new ingredient arrives with the new version.

Catalogue ingredients need nothing. Removed ingredients lose `viaRecipe` but stay visible if another source applies. Old versions stay readable through the lineage.

### Re-sharing

You can share an item only if every private food in it is **yours or already visible to that recipient**. Example: Alex shares all foods with Sam, Sam builds a recipe with Alex's chicken, and Sam shares the recipe back with Alex. That's allowed. Otherwise the share is refused with "Couldn't share Chicken pasta: Sam's oats is Sam's food. Make it yours first", plus a **Make these yours** action. That action copies the foreign ingredients into your foods and saves the recipe as a new version using the copies. The same rule applies to copy links and to logging for someone.

### Sync (app)

New server endpoint `GET /api/protected/user/foods/shared?since=<cursor>` returns:

- the caller's `FoodAccess` rows with `updatedAt >= cursor`, including revoked ones;
- the rows of those lineages (all versions, with servings, ingredients, nutrients and images) changed since the cursor, or all of them for a lineage that was just granted;
- `linked_people` (small).

Watermelon v18:

- `food_access` (`recipientId` indexed, `lineageId` indexed, `ownerId`, the `via*` flags, `hiddenAt`, `revokedAt`)
- `people` (`forUserId` indexed, `personId`, `displayName`, `kind`, grants)
- `food_items.lineageId` (indexed) and `copiedFromLineageId`
- `messages.loggedByUserId` / `loggedByName`

Extend `tests/watermelon-migration.cjs` for all of this.

- **Revoked access:** delete the local rows of that lineage, unless your own logs still reference them. After a detach they point at the copy, which arrives in the same pull, because your own foods pull runs first.
- **Signed-in account changes:** every query filters `food_access.recipientId = me`. Rows left by another account on the same phone stay hidden, as other users' rows already are.
- **Realtime:** subscribe to `FoodAccess` filtered by `recipientId` so a new share appears within seconds. The cursor stays the source of truth.
- **`foodChoices.ts:44` / `:88` and `useUserFoods`** change from "private and not mine = hidden or catalogue" to "mine / shared (via `food_access`) / catalogue".

### Owner deletes a shared food

It's archived as today, so it leaves every recipient's lists and search. Their past meals still show it, because access to the lineage remains. If they used it in their own recipe, the recipe keeps the archived version, the same as when you archive your own ingredient. **Decide:** also give users who used it a copy straight away (recommended: yes, the same "used = keep a copy" rule, so a later unlink has nothing to clean up).

---

## 4. Logging for each other (phase 4)

### Who can

A logs for B only while an active link exists **and** B's grant to A has `canLogForMe`. The check lives in `log_foods_as_meal_for(actor, targets[], …)` and `process-message` fan-out, inside the transaction, with the link row locked `FOR SHARE`. If B revokes mid-request, the request fails rather than writing.

### App

- **Add Food (both AI and Manual)** gets a **header button** showing the chosen people's `PersonAvatar`s, to the right of the AI | Manual control (owner picked this, option B, 2026-10-07). It only appears when someone has granted you `canLogForMe`. Because a header button is easy to overlook, the Log/send button names the people whenever the choice isn't just you ("Log for Me and Alex"). Tapping the header button opens a sheet with **Me** plus each person who allowed it, as a multi-select. The choice resets to "Me" after each log: a sticky "for Alex" is how meals end up in the wrong diary.
- **Manual (tray):** `POST /foods/log-meal` takes `forUserIds` (with `me` optional). The server creates one meal per person in one transaction, all with the same `logGroupId`, each priced on the server. Idempotency is per `(localId, userId)`, so a retry doesn't double-log anyone.
- **AI (text or photo):** resolve **once**, under the logger's visibility (their foods and shared foods), into the logger's meal or a hidden working meal if the logger didn't pick themselves. Then copy the resolved rows into each target's meal.
  - Targets' meals are created up front as `PROCESSING` placeholders with the `logGroupId`, so each person sees "Sam is logging…".
  - If resolution fails, every meal in the group fails together, and the logger gets the error.
  - Photos stay the logger's: target meals keep a reference and don't copy images (**decide**).
- **Auto-sharing:** every private food used (the logger's own) gets `FoodAccess.viaLog` for each target, plus its recipe ingredients. It then shows in their Foods as "From Sam" so they can log it again. Foods shared with the logger by a third person are refused for a target who can't see them (the re-sharing rule), with "Make these yours".
- **Same amounts for everyone in v1.** Each person can change their own portion afterwards, like any meal. **Decide:** per-person portions in the "For" sheet (for example "Alex × 1.5") as v2.

### Days and timezones

`consumedOn` holds a UTC instant, and each person's day comes from their own `tzIdentifier`.

- **"Now":** the same instant for everyone.
- **A chosen day and time** (meal prep: "Tue lunch 12:30") means **12:30 on Tuesday in each person's own timezone**. The server converts per target, so the logger never needs the target's timezone, and it's never exposed.
- **Future meals** are allowed up to a year out (the existing MCP rule). They're ordinary meals on future days.

### Duplicates (partners both logging dinner)

Before writing, the server checks each target for a meal within ±90 minutes whose lineages overlap at least half. If one exists, it returns `possible_duplicate` with the existing meal, and the app asks "Alex already has a similar meal at 7:12 pm. Log anyway?" Agents get the same code and must pass `allow_duplicate`.

### What the target sees

- **Log row:** the logger's **initial** (`PersonAvatar`, the same size as the sparkles mark) instead of sparkles, labelled "Logged by Sam" (owner picked this, option B, 2026-10-07). With an agent: "Logged by Sam via Claude", with the initial (the person is the actor).
- **Meal details:** a "Logged by Sam" footnote, like the agent one, plus a **Remove** button.
- **Push:** "Sam logged lunch for you · 640 kcal", tapping opens the meal. Meal prep for a week is coalesced: "Sam planned 14 meals for you this week".
- **Full control:** it's their diary. They can edit, move or delete it like any meal. Deleting doesn't tell Sam.
- **Decide:** an optional "Review meals others log for me" setting, where meals arrive as suggestions until accepted. Recommended later rather than v1: immediate logging plus a notification plus Remove is simpler and matches the partner case.

### What the logger sees

- On the person's page: **"Meals you logged for Alex"**, read through a server endpoint (React Query, **not** Watermelon), backed by `Message` where `loggedByUserId = me` and the grant is still active.
- The logger can **edit or delete those meals** while the grant lasts, through server functions mirroring the `agent_*` meal functions (with `p_actor`). After revocation they lose access. Read RLS on `Message` is **not** widened. The app keeps writing its own meals directly, and the logger's access goes through server functions only.
- A logger who picked "Me" too also gets their own meal, which is an ordinary meal in their diary.

### Subscription (decide)

Today, meal-operations logging requires a subscription. Recommended: the **logger's** subscription is checked (they're using the AI), and targets need none to receive meals. Coaches pay, clients don't.

---

## 5. MCP (phase 5)

New tools, all running as the token's user:

| Tool | Kind | Notes |
|---|---|---|
| `list_people` | read | Linked people, their kind, and what each side may do. No profiles beyond the display name. |
| `list_shared_foods` | read | What I share with whom, and what's shared with me. |
| `share_foods` / `unshare_foods` | change | `food_ids[]` × `person_ids[]`, up to 50 × 50 per call. Same re-sharing rule; unsharing detaches the same way. |
| `create_copy_link` | change | Returns the URL. |
| `log_meal` / `add_to_meal` | change | Gain `for_person_ids` (default me). One call can log for several people (`logGroupId`). The duplicate check applies, with `allow_duplicate`. |
| `log_meals` (new, batch) | change | Up to 100 entries `{person_id, eaten_at, foods[]}` for meal plans, in **one transaction per person** (a failure for one client doesn't block the others). Returns per-entry results. |
| `list_meals` / `get_meals` | read | `person_id` returns only meals **I logged** for them (until phase 6). |
| `update_meal` / `delete_meal` / `restore_meal` | change | Allowed on meals I logged for someone while their grant lasts. |

**Rules.**

- Change tools need, as today, `mcp_writes`, the actor's `AgentSettings.writesEnabled`, and the `people` flag. Logging for someone also needs that person's `canLogForMe` grant to the actor.
- **Agents can't create links, accept invites or change grants.** Consent is always the person in the app, like the "Let agents make changes" switch. Agents can create invite links for the trainer to send, but never accept them.
- **Decide:** a per-grant "Allow Sam's agents to log for me" option. Recommended: no separate switch. The grant is to Sam, and the "via Claude" label stays visible.
- **Limits** count per actor. Add a separate bucket for logs for others: 2,000 entries a day, and a batch counts its entries, not one call. 30 clients × 5 meals × 7 days = 1,050 for a week's plan. `McpRequest` records `targetUserIds` for audit.

---

## Account deletion (phase 0, then extended)

Rewrite `deleteUserAndData` as one SQL function, `delete_user_data(p_user)`, that checks errors:

1. End every link the user has, **detaching every recipient first** (they keep copies of what they used).
2. Delete their messages and logged foods (their diary), and their invites, shares, access and blocks.
3. **Private foods:** archive and keep the rows. Orphaning is the existing design. Delete only rows nobody else references. Never delete by `userId` (the creator), which removes catalogue foods.
4. Meals they logged for others stay, with `loggedByName` and `loggedByUserId` set to NULL by the FK.
5. Then `auth.admin.deleteUser`.

Clean up the non-cascading FKs (`MealOperation`, `MealRevision`, `UserMessageImages`, …) in the same function, so deletion can't half-fail.

---

## Phases

Each phase ships behind `people` (owner and the second user), is deployed and tested on both phones, then moves on.

| Phase | Server | App | Done when |
|---|---|---|---|
| **0. Foundations** | `lineageId` backfill; the `food_visible` helper replaces every inline rule (no behaviour change, proven by the existing DB tests plus a grep test); `displayName`; multi-device push tokens plus `notify()`; cron secret; `delete_user_data` | Display name prompt; open tapped notifications; Watermelon v18 columns | Evals and DB tests unchanged; both phones get pushes |
| **1. Copy links** | `FoodCopyLink`, `copy_food_lineage`, `/f/*` page plus AASA | Share › Copy link; Add food preview | A recipe with private ingredients copies cleanly on the second phone |
| **2. People** | Links, grants, invites, blocks, email lookup, `end_link` (sharing parts stubbed) | Settings › People, show/scan code, accept screen, person page | Owner and second user link by QR, by link, and by email; both can unlink |
| **3. Live sharing** | `FoodShare`, `FoodAccess`, `refresh_food_access`, RLS/search/agent use, detach, reference moves on version | Share sheet, Foods badges and filter, shared sync, Save a copy / Remove | Edit on one phone shows on the other; unlink leaves a used food as a copy and the diary unchanged |
| **4. Log for others** | `loggedBy*`, `logGroupId`, `log_foods_as_meal_for`, AI fan-out, duplicate check, logger edit functions | "For" pill, person mark, Logged by, Remove, logger's list, pushes | Partner logs dinner for both; trainer plans a week; revoke mid-flow refuses |
| **5. MCP** | Tools above, limits, audit | none | Claude shares 10 recipes with 3 people and plans a week for 2 in one session |
| **6. Later** | `canSeeMyLog` (trainer reads a client's diary and totals), review queue, per-person portions, web dashboard People | | |

---

## Tests

- **DB tests (`tests/*-db.test.cjs`)**, one per rule:
  - visibility in each direction;
  - versioned edits seen by recipients;
  - recipe ingredient closure;
  - the re-sharing refusal;
  - unshare/unlink detach: copies, references moved, nutrients identical, idempotent on retry;
  - grant revoked between check and write (two connections);
  - timezone conversion for meal prep across zones;
  - duplicate detection;
  - account deletion with links;
  - agent token can't write any new table.
- **Grep test:** no `"privateToUserId" = p_user_id` / `.eq("privateToUserId"` outside the helper and the owner-only paths (edit/archive).
- **App:** Watermelon migration test for v18; `check:theme` for the new screens.
- **Evals:** text and recipe evals after the agent search change (quote cost first).

## UI (owner picks from mocks, 2026-10-07)

1. **Foods tab:** option A. One mixed list, with an initials badge on shared rows and "From Sam" as detail, plus a filter pill (All · Mine · From Sam).
2. **Who it's for in Add Food:** option B. A header button with the chosen people's avatars beside AI | Manual. The Log button names them when it isn't just you. The picker is a multi-select sheet that resets to Me after each log.
3. **"Logged by" on a log row:** option B. The logger's initial in place of the sparkles, and "Logged by Sam" (or "via Claude") in the details.
4. **People:** option A, modelled on Connected agents. An explanation card with "Show my code" (opens a sheet) and "Scan code", plus "Invite by link or email". Then Requests and Linked sections. The accept screen and a person's page are as mocked: the invitee sets every switch; the page shows your grants as switches and theirs read-only; "Remove Alex" is silent.

**One new shared component:** `PersonAvatar` (initials on a colour derived from the user id; sizes for the badge, log row, list and header). It's used by all four.

## Copy

All copy follows AGENTS.md: sentence case, "…", "meal", "food", "Sign in", and errors through `errorCopy` ("Couldn't share Chicken pasta. Try again"). Draft strings:

- "Show my code", "Scan code", "Share invite link"
- "Let Sam log meals for you"
- "Share all my foods with Alex"
- "From Sam", "Shared by Sam", "Logged by Sam", "Logged by Sam via Claude"
- "Save a copy", "Remove from my foods", "Remove Alex"
- "If they use Amino, they'll get your request"

## Open decisions

1. ~~Removal notice~~: silent (owner, 2026-10-07).
2. Give users of a deleted shared food a copy straight away (recommended yes)?
3. ~~Subscription~~: the logger's (owner, 2026-10-07).
4. ~~Per-person portions~~: no; same amounts, each person edits their own portion (owner, 2026-10-07).
5. Review queue for meals others log: later (recommended)?
6. Photos on meals logged for others: reference, copy, or text only?
7. A separate "allow Sam's agents" grant (recommended no)?
8. ~~Trainer diary view~~: not for now, maybe later in the web UI (owner, 2026-10-07).
