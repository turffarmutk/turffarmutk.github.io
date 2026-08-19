# Turf Farm Inventory — putting it on a phone

## Do this once (about two minutes)

1. Open **app.netlify.com/drop** on the computer.
2. Drag **`Inventory-App.zip`** onto the page. Wait for the green check.
3. Copy the link it gives back. Text or AirDrop it to the phone.
4. On the phone, open the link **in Safari**, then **Share → Add to Home Screen**.

Done. Use the home screen icon from then on — it opens full screen and works
with no signal, out at the cage or in the barn.

**If Netlify shows a password prompt:** anonymous drops are password-protected
until claimed. Either note the password it displays, or sign in with a free
account and click **Claim** to remove it.

---

## Daily use

Search, or tap a type chip across the top — Fungicide, Herbicide, Insecticide,
PGR, Fertilizer, Adjuvant, Other. The dropdown beside the search box narrows
any of those to one location.

Tap a product to open it, then:

| Control | Does |
|---|---|
| **−** / **+** | One step (half gallon for liquids, one bag or pound otherwise) |
| **− 1 full** | Removes one whole container |
| **Halve** | Cuts what's left in half |
| **Used up** | Sets it to zero |
| Number field | Type an exact amount |
| **Undo** | Back to the original spreadsheet value |

Every tap saves to the phone immediately. Edited items get an orange border and
show under the **Changed** chip.

---

## Getting it back into the spreadsheet

**Save file → Excel workbook.** Same eight columns as
`Inventory of Cages_Bulk Materials.xlsx`, same row order, plus two additions:
`Original Entry` (the old free-text amount) and `Type`.

Worth doing after any big count, as a backup. **Changes only** gives a short
before/after list instead, handy for a reorder email.

---

## Two things to know

**The CHECK chip — 15 items.** The old sheet recorded stock as text: "2 Full",
"1 Full 1 partial", "Low", "44 bags". Those became a number plus a unit by
multiplying container count by container size. Fifteen entries were too vague to
convert exactly and were estimated. Work through that chip once and the marks
clear as you confirm them.

**Types were assigned automatically** from each product's active ingredient,
falling back to the product name. A few one-word entries were guesses. If one is
wrong, open the item and change **Type** in the editor — it sticks and exports.

---

## Updating it later

Edit `Inventory-App/index.html`, bump `CACHE = 'turf-inv-v1'` to `v2` in
`sw.js`, re-zip the folder contents, and drag it onto Netlify Drop again
(**Deploys → drag to redeploy** if you claimed the site). Phones pick up the new
copy the next time they have signal.

---

*The loose `Inventory-Entry.html` in this folder is just a placeholder pointing
here — safe to delete.*
