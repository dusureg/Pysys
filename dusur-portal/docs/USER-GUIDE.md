# User guide

Screen and button names below are the English labels in the app. Switch language and theme with the buttons in the header; the choice is remembered per browser.

## Part 1: Admin (you)

### Unlock and lock

Open the admin address. The lock screen has two tabs: **Administrator** (the admin password) and **Team member** (user name and password, see [Team](#team-members-roles-pause-and-block)). Enter the admin password (**Unlock**). Decrypting your records takes a second or two. The site locks itself after inactivity (**Settings, Lock after inactivity**: 5, 15, 30 or 60 minutes, default 15) or when you press **Lock**. Locking clears everything from memory. *Forgot password? Reset configuration* clears only this browser's stored connection; your data in the repository is untouched and you can connect again, but **without the password the encrypted data cannot be recovered**.

### Navigation

| Screen | What it is for |
|---|---|
| **Dashboard** | Totals (clients, projects, active, overdue), finance KPIs, profitability by project type, client ratings, the client list with search |
| **Progress** | The workshop-day screen: tick tasks, set part statuses, add photos, tell the client |
| **Logistics** | Shipments and their steps: add, edit and complete steps, late and blocked shipments, receive into the inventory |
| **Supply chain** | Your suppliers: phone, WhatsApp, e-mail, website, location, map link, address |
| **Inventory** | All materials with quantities and an alert for every item, movements, the to-order list |
| **Collections** | Every instalment the clients still have to pay, overdue first, with a WhatsApp reminder (4.5) |
| **Reports** | Finance, BOM, production and satisfaction reports, and the printable reports of Logistics, Supply chain and Inventory; print or Excel |
| **Finance** | Direct cost, indirect cost and total operations cost for any period, the cost of every project, the expense ledger and a monthly budget |
| **History** | Every change by everyone: who, when, which record, and each field before and after |
| **Team** | Members, roles, pause and block, changing the encryption key (administrator only) |
| **Settings** | Company profile, the client rating inbox, business defaults, this device, project types |
| **Configuration** | Repository and token, change admin password, connection code for another device (administrator only) |
| **Troubleshooter** | A check-up that explains why the page does not load or save, works even before you sign in |
| **My account** | Your name, phone and picture, your user name, role and password |
| **Import** | Opened from the *Import* button of Inventory, Supply chain, Logistics and Finance: fill them from a CSV, Excel or JSON file (4.5) |

What a person sees in the menu depends on their role: someone without access to an area does not see its screen at all.

### Create a client and a project

1. Dashboard, **New client**.
2. **Details**: client name, phone (and optional second phone, e-mail, address, private notes), then the project: type (kitchen, dressing room, ...), title, description, start date, due date (pre-filled from the default duration), contract price. The **Client ID** (`DS-CL-1001`) and **project number / SKU** (`DS-KIT-2610-0001`) are generated for you.
3. **Stages**: the stages and checklist items come from the project type; add, remove, rename or reorder them for this project. Tick items as the work is done; progress is the share of ticked items.
4. **Parts**: pieces or furniture parts with quantity, status and due date. The client sees these.
5. **Payments**: every payment received (date, amount, note). Remaining money = price minus payments. The client sees these.
6. **Costs & profit**: private. Add each cost as **COGS** (direct: materials, hardware, labour, outsourced, delivery, installation) or **operating** (overhead). The tab shows revenue, COGS, gross profit and margin, operating cost, net profit and margin, markup, and collected percentage.
7. **BOM list**: private bill of materials (boards, edge banding, hardware, accessories, glass, finishing) with quantity, unit and unit cost. **Add to costs (COGS)** creates one COGS line per category in the Costs tab and replaces the lines it made before; lines you typed yourself are never touched. **Print BOM list** prints it.
8. **Photos**: save the client first, then upload pictures (up to 30 MB each; they are resized and encrypted in your browser, which also drops camera metadata such as GPS) or add an `https://` link to a picture hosted elsewhere, with a caption. Uploaded photos are committed to the repository as soon as they are added and the record is then saved automatically.
9. **Save & publish**. The page shows the **Private link for the client** and the **Client Secret Key**. Send them through different channels (for example the link by WhatsApp and the key by a phone call or SMS).

One client can have several projects (project tabs at the top of the editor, add another with the add-project button). The client sees them all under the same link and key.

What the client **never** sees: costs, profit, margins, internal notes, BOM, other clients. The editor says so next to the price ("The client sees the price, the payments received and the remaining balance. Costs and profit are never shared").

If you change something and leave the screen, you are asked whether to discard unsaved changes.

### Progress and photos (the workshop-day screen)

**Progress** in the menu is for updating a project quickly, from a phone or a computer.

1. The list shows every project, late ones first, then the ones with a due date, then the rest. Filter with **Active / Late / Completed / All** and search by client name, client ID, project number or title. Press **Update** on a project.
2. **Stages and tasks**: tick a task when it is finished. The percentage at the top and the stage status change at once. **Tick all** completes a whole stage (press again to untick).
3. **Parts**: set the status of each piece.
4. **Photos**: **Add photos** (from the gallery, several at once) or, on a phone, **Take a photo**. Photos are resized, stripped of camera data, encrypted and saved straight away, and the record is saved with them. You can also add a link to a picture.
5. **Save & publish** sends the update to the client's page (an open page refreshes within a minute).
6. **Tell the client** opens WhatsApp with a ready message: project, percentage and the client's private link (the secret key is never put in the message). It works after saving and when the client has a phone number; a local Egyptian number such as `01001234567` is sent as `+20 1001234567`.

**Full editor** (top right) opens the same client in the full editor with your unsaved ticks kept, and **Progress** there brings you back. If a client has more than one project, switch between them with the project tabs.

### Supply chain (your suppliers)

**Supply chain** in the menu is the directory of the people you buy from. It is private: stored sealed with the same key as your other records and never shown to a client.

1. **Add supplier**: name (required), category (boards, edge banding, hardware, finishing, glass, accessories, transport, tools, services, other), contact person, **phone**, a second phone, **e-mail**, **website**, **location** (city or area), a **map link** (Google Maps or similar), another **link** (a catalogue, a shop page), the full **address**, payment terms, usual lead time in days, and notes.
2. Each contact detail becomes a working link on the supplier's card: **call** (`tel:`), **WhatsApp** (a local number such as `0100 123 4567` is sent as `+20 100 123 4567`), **e-mail**, **website**, **map**. Web addresses must be `http` or `https` (a bare `www.example.com` gets `https://`); anything else, such as a `javascript:` or `data:` address, is refused with a message, and a phone number or e-mail that does not look right is refused too.
3. The list has **search** (name, contact, phone, e-mail, website, location, address, link, notes) and filters by category and by **Active / Inactive / All**. **Inactive** keeps the supplier and its history but removes it from the lists you pick from.
4. A supplier's page shows the **materials it supplies** and its **shipments**. A supplier used by a material or a shipment **cannot be deleted** (deactivate it instead); an unused one can, after a confirmation.
5. **Printable report** opens the supplier directory as an A4 landscape report (a table with all details, the number of suppliers per category, and the materials per supplier).

### Inventory (materials and alerts)

**Inventory** in the menu is the stock room: every material, how much there is, and what needs attention.

**The table.** On a computer the materials open as a **table** with the columns *Material, In stock, Minimum, Maximum, On order, Status, Unit cost, Value, Supplier* and the actions, ending in a **totals row** (number of materials and total value). Every row has the coloured edge of its alert. **Group by** *Category, Status, Supplier* or *No grouping* (each group has a header with its count and value, and can be folded with its arrow) and **Sort by** *Urgency, Name, Category, Stock level, Value, Supplier* (the arrow beside it reverses the order; clicking a column heading does the same). On a phone the default is **Cards**, one per material; the **View** switch (*Table / Cards*) changes it on any screen, and on a phone the table scrolls inside its own frame. Everything below works in both views.

1. **Add material**: name (required), code, category and unit (the same lists as the BOM), **quantity now** (the opening stock), **minimum level** (alert at or below it), **maximum level**, usual **order quantity**, **unit cost**, **supplier** (from the Supply chain list; inactive suppliers are not offered), **place** (shelf or store), **expiry date** and notes. A preview next to the form shows the alert and the value of the stock as you type.
2. **Alerts on every item.** The red and amber ones need attention: **Out of stock** (quantity 0), **Low stock** (at or below the minimum), **Expired**, **Expiring soon** (within 30 days). The grey ones are information: **Above maximum**, **No supplier**, **No minimum set**. The summary tiles count them, and the **Inventory** menu item shows the number of items that need attention.
3. **Receive / Use / Stock-take** buttons on every row or card change the quantity in one step and keep a **history** (date, type, change, balance after, note). *Use* cannot take more than is in stock. *Stock-take* sets the quantity to what you counted. Changing the quantity inside the material's form is recorded as a stock-take with the difference. Each material keeps its last **40** movements.
4. **To order**: the materials that are out of stock or at their minimum, **grouped by supplier** with phone and WhatsApp links, a **suggested quantity** (up to the maximum, or twice the minimum when there is no maximum, but never less than the usual order quantity) minus what is already **on order** in open incoming shipments, and an estimated cost. **Print order list** prints it.
5. Filters: search (name, code, place, supplier), category, supplier (or *no supplier*), and Needs attention / Out / Low / Expiring / In good stock / All.
6. Using materials in a project (the BOM list) does **not** reduce the inventory by itself. Record what the workshop used with **Use**.

### Logistics (shipments and their steps)

**Logistics** tracks every movement of goods, step by step.

1. **New shipment**: a name and the **type**: *From a supplier* (incoming), *To a client* (outgoing) or *Between places*; then carrier or driver, tracking number, from, to, **expected arrival**, shipping cost and notes. An incoming shipment also has the supplier and your order or waybill number; an outgoing one has the **client and project** (picked from your clients).
2. **Steps.** A new shipment starts with standard steps for its type (incoming 7: order placed, confirmed, dispatched, in transit, arrived, checked and counted, stored; outgoing 5; between places 3). You can **add** a step, **rename** it, give it a **status** (Waiting, In progress, Done, Blocked), a **planned date** and a **note**, **move it Up or Down**, **remove** it, or **add the standard steps** again. Choosing *Done* stamps today's date. Changing the shipment type swaps the standard steps only when you have not touched them.
3. **On the list**: each shipment shows its progress, the **current step** and a **Done: <step>** button that completes the current step in one tap and makes the next one current. A shipment is **Planned**, **On the way**, **Blocked** (a step is blocked), **Completed** (every step done) or **Cancelled**; it is flagged **Late** when its expected arrival date has passed and it is not completed. The menu item shows how many shipments are late or blocked.
4. **Materials in this shipment** (optional): link each line to a material of the inventory with a quantity, or type a name for something that is not in it. Linked lines show on the Inventory screen as **on order**. When an incoming shipment has arrived, **Receive into inventory** adds the linked quantities to the stock **once** (each movement carries the shipment number, so receiving twice adds nothing) and marks the shipment as received.
5. **Print shipment sheet** prints one shipment on one A4 page: details, steps with a column for initials, and materials with a tick column, to follow on the loading dock. **Printable report** prints the list of shipments (landscape, with a chart of the states and the open steps).

### Printable reports for every section

Each of the three sections has a **Printable report** button that opens **Reports** on the right report; you can also pick them in the Reports screen: **Inventory: stock list and alerts**, **Reorder list (by supplier)**, **Stock movements**, **Supplier directory**, **Logistics: shipments** and **Shipment sheet**. They look like the other reports (logo, date, Confidential mark, charts), show the filters that make sense for each one, print or save as PDF from the browser, and download as Excel with native charts. They show the position **today**, except stock movements and shipments, which can also be limited by date.

### Two devices at the same time

Suppliers, materials and shipments are changed **one record at a time**. If you and another device save at the same moment, your change is applied again on top of the newer copy instead of overwriting it, so nothing the other device saved is lost. The other device sees your change after it presses **Refresh** or reloads the screen.

### Contract (printable, with your signature)

Open a client and press **Contract** (or open `Contract` from the Dashboard list). One contract per project.

1. **Options** at the top: contract language (Arabic, English, or **both side by side**, English on the left and Arabic on the right, clause by clause), contract number (empty = `CT-` plus the project number), date (empty = today), warranty in months (empty = the default from Settings, `0` removes the warranty clause), site address, payment schedule (for example "50% on signing, 30% on delivery, 20% after installation"), special conditions in Arabic and English, and whether to print a signature box for the client.
2. The **paper** below is the contract as it will print: your logo and contact details at the top (from the company profile), the two parties, the work (type, title, reference, dates), price, paid and remaining with every payment received, the ten standard clauses (numbered), special conditions, and **last on the paper**: the closing sentence and the signature block with **your signature**, name, title and date next to a blank box for the client.
3. **Print / Save as PDF**: choose *Save as PDF* as the printer. It prints on A4 with page numbers. If colours print grey, turn on *Background graphics*.
4. Options are saved with the client (**Save & publish**), privately. They never appear on the client's page.

The standard text is a **general template, not legal advice**. Have a lawyer read it once, then adjust it in Settings.

### Edit or delete

Open a client from the Dashboard list. **Save & publish** writes the private record and the encrypted client snapshot and updates the search index. Deleting a client removes the private record, the published snapshot, its photos and its search-index entries.

### Client ratings

When every task of a project is done, the client portal offers a rating out of 10 with a comment (if enabled in Settings, *Ask clients to rate completed projects*).

**From the site itself (4.4).** If you set up the **client rating inbox** (Settings, [docs/INBOX.md](INBOX.md), about five minutes) the client presses **Send my rating** on the client site and it reaches you with no other app. The Dashboard checks the inbox by itself when it opens (at most once every ten minutes, only for people who may edit ratings), and **Check for new ratings** on the ratings card does it on demand. The new ratings are saved exactly like imported ones, shown on the Dashboard, in the project editor and in the Satisfaction report, and each import is written to the History. Without an inbox, or when it is down, the client still has the older way below.

**By message.** The client sends you a message containing an encrypted code (`DSFB1....`) by WhatsApp or e-mail, or by copying it. On the Dashboard open **Import a client rating**, paste the message or messages, press **Import ratings**. Each code is checked with that client's secret key; a project that already has a newer rating keeps it. Ratings appear on the Dashboard (average, latest), in the project editor, and in the Satisfaction report. Until a rating arrives the project shows "Completed. Waiting for the client's rating."

### Finance (direct cost, indirect cost, total operations cost)

**Finance** in the menu answers "what does it really cost us to run, and are we making money?". Choose the **period** (*This month, Last month, This quarter, This year, Last 12 months, All time, Custom dates*) at the top; everything on the screen follows it.

- **Direct cost** is what the work itself costs: the cost lines of every project (materials, labour...) plus direct **expenses** you record that belong to production as a whole (for example workshop wages).
- **Indirect cost** is the overhead: each project's operating cost plus indirect expenses (rent, power, salaries, marketing, vehicles, insurance, taxes, software...).
- **Total operations cost** = direct + indirect, with the **operating profit** (contract revenue minus total cost), the **overhead rate** (indirect ÷ direct), the **break-even revenue** and the **fixed costs per month** (your repeating expenses).

Three tabs: **Overview** (the numbers, a bar splitting direct and indirect, the cost structure by category, month by month, and the **monthly budget**), **Projects** (what each project cost, with its own costs and its **share of the shared costs**, profit and margin) and **Expenses** (the ledger).

**How shared costs are spread.** Expenses that belong to no single project are divided among the projects of the period. Choose the basis with **Spread shared costs by**: *Contract price* (the default: bigger jobs carry more), *Direct cost* or *Equally*. Whatever you choose, the shares add up to exactly the shared total (the screen and the report agree to the last cent).

**Budget.** In the Overview enter a monthly budget for direct and for indirect cost. Each line shows what the period cost against the budget, in amber above 90 % and red over it. It is stored in the private settings.

**Expenses.** *Add expense* (or open one to edit it): date, name, **Direct or Indirect**, category, amount, how often it **repeats** (not at all, monthly, yearly), an optional *Until* date and notes, and optionally the supplier. A repeating expense counts once for every month (or year) from its date up to the end of the current month, or up to *Until*; it never counts into the future. The ledger filters by kind, category and text. A person with **View** access sees the same screens with the forms switched off.

**Printable.** *Printable report* opens **Reports, Costs: direct, indirect and total** with the same period and basis: KPIs, charts (the split, the biggest categories, the months), the structure, month by month, per project and the full ledger, on paper, as PDF or as Excel with native charts.

### History (every change, by everyone)

**History** lists everything that was changed in the system, newest first: the person (with their role), the time, the area, what they did (*created, changed, deleted, imported, paused...*), the record, and for every change **each field before and after** (for example `payments[2].amount: 5000 → 7500`). Secrets are shown as `•••` and photos as *(image)*. Filter by month, person, area, action, a word and a single record; long months open in pages with *Show more*. Every record form (client, supplier, material, shipment, expense) has a **History** button that opens the history of just that record.

- The badge **Intact / Broken** says whether the month's entries still form an unbroken chain. *Broken* means an entry was edited or removed after it was written: see [SECURITY.md](SECURITY.md#team-roles-and-the-history-44-what-they-really-protect) for exactly what that does and does not prove.
- If an entry could not be written (no connection), the screen says how many are **waiting**; they are retried automatically and never block a save.
- **Printable.** *Printable report* opens **Reports, History** for one month, with the same person and area filters, as paper, PDF or Excel.
- History is for people with the **History** area (the Manager role has *View*); the administrator always has it.

### Team: members, roles, pause and block

Only the administrator opens **Team**. Several people can work in the system at the same time, each with a **role** you give them.

1. **Add a member**: name, user name (3 to 30 letters, digits, `.`, `_`, `-`), role, and a temporary password (a strong one is suggested; at least 10 characters). Send them the **sign-in link** shown on the Team screen and the temporary password, by different channels. At their first sign-in they must choose their own password before doing anything else.
2. **Roles.** For each of ten areas (*clients, progress, finance, suppliers, inventory, logistics, reports, ratings, settings, history*) a role is **No access, View or Edit**. Five roles come ready: **Manager** (everything, History view only), **Accountant** (edits finance and reports; views clients, suppliers, inventory, logistics and ratings), **Production** (edits progress, inventory and logistics; views clients, suppliers and reports), **Sales** (edits clients and ratings; views progress and reports) and **Viewer** (views everything except finance, settings and history). Edit them or add your own. A change reaches signed-in members within about two minutes.
3. **No access to administrator settings.** The Team screen, Configuration (admin password, token, connection code) and *Change the encryption key* can never be given to a role: only you.
4. **Pause** stops a member's access within seconds (the page checks every 20 seconds and before every save) and keeps their login, so you can **Resume** later (holidays, a dispute). **Block** signs them out and deletes their login; to let them back in you give them a new password. **Remove** deletes the member. Their past changes stay in the History.
5. **Change the encryption key** is the full cut-off when someone who had access must never see new data again: it re-encrypts everything in one step under a new key and everybody signs in again. Afterwards also **replace the GitHub token** in Configuration. Read [SECURITY.md](SECURITY.md#team-roles-and-the-history-44-what-they-really-protect) first: roles keep honest colleagues from touching the wrong thing, they are not protection from a determined insider.

What a member sees: only the screens their role allows; forms of areas they may only view are read-only and show a note; the Save button is not there. **My account** shows their role and lets them change their password (the old one is needed).

### Collections: the dates your clients agreed to pay on (4.5)

1. Open a client, the **Payments** tab. Enter the price and the money received as before, then look at the **Collection schedule** card.
2. **Add instalment** (a date, an amount, an optional note) for every payment the client agreed to, or write the number of payments and the date of the first and press **Split**: what is not yet scheduled is divided into equal monthly payments (the last one takes the rounding).
3. You can list **only what is still to come** (the deposit you already received is taken off first) or **the whole price** including the deposit: both give the same answer. When money is received, add it under *Received* as always: the schedule matches it to the earliest instalment by itself and each row says **Collected, Part paid, N days left** or **Overdue by N days**. The card also shows what is scheduled, the next payment, what is overdue and what has **no date yet**.
4. **Save & publish.** The client now sees *Next payment* (amount, date, overdue or days left) and the list of instalments on the client site; the contract paper gets an **Agreed instalments** table. Do not write anything private in an instalment's note: the client reads it.
5. **Collections** (menu, Money group) is the whole picture: tiles for *overdue*, *due in 7 days*, *due in 30 days* and *no date yet*; a filter and a search by client, phone or project; every line has **Remind on WhatsApp** (opens WhatsApp for that client with a ready message: name, amount, project reference and date), **Copy** and **Open client**. **Print report** gives the same list as paper, PDF, Excel, a picture or a share.

### Import from a file (4.5)

Press **Import** on Inventory, Supply chain, Logistics or Finance (expenses). Choose a CSV, Excel (.xlsx) or JSON file, or download the blank template first. The screen matches the columns by their names in English or Arabic (check and change the match if needed), then shows a **preview: how many rows will be added, updated, left alone or refused, and why**. Nothing is saved until you press **Import**; the whole file is then one change and one History entry. *Add only* skips records that already exist; *Add and update* matches them by code, then by name and changes only the cells that are not empty. Refused rows can be downloaded as a file to correct and import again. Excel files with macros or a password are refused; only the first sheet is read.

### Share, pictures and paper (4.5)

- **Share** (on every record and report): WhatsApp, e-mail, **Copy**, the phone's own share sheet when it has one, and for reports **the picture**.
- **Picture** (reports): downloads the report as a PNG at the width of your paper, for a chat message.
- **Paper size** (Settings): A4, A3, Letter or Legal. Reports, contracts and every printed page follow it, and PDFs come out on that size.

### Internal codes, units and the BOM (4.5)

- **Codes** (Settings, *Internal codes*): a pattern for materials, suppliers and shipments, for example `MAT-{CAT}-{N:4}` gives `MAT-BRD-0012`. Every new record gets its code by itself; it never changes once given; *Give codes to records that have none* fills the old ones. Codes are searched, shown on the sheets and imported.
- **BOM and the inventory**: in a project's BOM tab a line can be *linked to a material*: it takes its name, code, unit (piece, sheet, metre, m², kg, litre, set) and cost and shows the stock. **Take from stock** books the quantity the line needs out of the inventory; the project remembers it, so it is never taken twice, and removing the line asks to put it back.

### WhatsApp and the client reference (4.5)

- The WhatsApp button of a client or supplier is made from the phone number (a number starting with 0 gets the country code 20). Type another number or a WhatsApp link in the **WhatsApp** field to change it; the address that will open is shown under the field.
- A project is shown everywhere as **client ID / SKU** (for example `DS-CL-1001/DS-KIT-2610-0001`), with a copy button on the Details tab. Use it when you speak with the client or write on a delivery sheet: the SKU itself is unchanged.

### Sign in with a user name, and your profile (4.5)

- **Administrator sign-in on any device**: *Team*, *My sign-in on any device*: choose a user name and a long password (at least 12 characters). Open the address shown there on any device, choose the *User name* tab and sign in. The token and admin password methods keep working. Read the warning on that card and in [SECURITY.md](SECURITY.md#administrator-sign-in-with-a-user-name-45).
- **My account**: your name, phone and a picture (it is cropped and shrunk on your device) appear in the menu and in the Team list.

### Contracting and the wording of a contract (4.6)

**Contracting** in the menu lists the contract of every project in one table: contract number, client, project, price, the wording it uses, language, status and dates. Filter by status (*Drafts, Issued, Signed*), search by contract, client, phone or project, and press a line to open that project's contract. **Print** gives the same table on paper; the report **Contracts: status and value** (Reports) is the same list with a chart and an Excel file.

On a contract's screen:

1. **Wording of this contract**: *Standard clauses (Settings)*, a **template** from Settings (a named set of clauses such as *Kitchens* or *Dressing rooms*), or **Own wording for this project**. With own wording, *Start from the current clauses* copies the clauses you see now into two boxes (Arabic and English) that you can edit; *Remove own wording* goes back. A language left empty uses the standard or template clauses. The same placeholders as in Settings work.
2. **Contract status**: *Draft*, *Issued* or *Signed*. The date is stamped when a contract becomes issued or signed (going back to *Draft* clears the dates) and shown under the status and in the Contracting list.
3. **Formal copy (black and white)**: shows and prints the contract with no colours (black text, a black band, grey lines), for filing or a black-and-white printer. It is only a way of showing the same contract: nothing else is saved for it, and the saved PDF is named with `-bw`.

**Templates** are made in Settings > Contract (*Templates of wording*, up to 12; a template needs a name in at least one language).

### Labels (4.6)

Open a project and press **Labels** (also on each line of Contracting). Choose the **size** (2.5 × 2.5 cm, or a strip 2.5 cm tall and 3 to 30 cm long), **one label for** the whole project or for every piece (the pieces come from the Parts tab), the number of copies, and **what is printed**: logo, a thin Egypt flag with the slogan, client ID, client name, SKU, product, the piece, the date, a **QR code** of the SKU and/or a **barcode** of the SKU. Every label is one page of exactly its size, so choose your label printer, or *Save as PDF*, and you get one label per page. A label that is too full even with smaller text is shown with a dashed red edge: print fewer items on it. The defaults (size, slogan, fields, copies) are in Settings > Labels.

On a 2.5 cm sticker the **QR code is the one to use**: it scans easily. The barcode is thin at that size; if you use it, test a printed label with your scanner first.

### Brands, pictures and invoices (4.6)

- **Brands**: Settings > Brands is your list of brands (up to 80). On an inventory item choose its brand and add a **picture** (shrunk on your device; a small copy shows in the list). Pictures and files are encrypted with your key and never published.
- **Invoices and files**: an expense, a shipment and an inventory item have an **Invoices and files** card: *Add a file* (a PDF or a picture, each up to about 760 KB after sealing; pictures are shrunk automatically). A file is saved when you save the record; *Remove* deletes it after the save. *Open* and *Download* show it again.

### Videos and files for the client (4.6)

On the **Photos** tab: **Add a video** (MP4, WebM or MOV, up to 24 MB, encrypted like photos and played on the client page after the key is entered) or paste a **video link**: a direct video file plays inside the page; a YouTube or Vimeo link opens on its own site. **Files for the client to download** (same tab): 3D models (GLB, GLTF, OBJ, STL, STEP, SKP, 3DM, 3DS, FBX), drawings (DWG, DXF), PDF, ZIP, pictures, TXT, CSV, XLSX, DOCX, PPTX, each up to 24 MB. The client can **download** them; the page never opens them. Larger files are refused; send those another way (a drive is planned for a later version).

### Down payment and the overview report (4.6)

- On the **Payments** tab, in the collection schedule, tick **Down payment** on the instalment that is the deposit (one per project). The client sees a **Down payment** box with its date and amount (and *Next payment* for the one after it); Collections and its report mark the row.
- **Company overview** (a button on the Dashboard, and the first report in Reports): clients, projects in production, contract value, collected, still to collect, overdue, late projects and stock alerts, charts, the list of every project with totals and a **Needs attention** list. Print it, save it as PDF, as a picture or as Excel. It is private: it holds money and stock.

### Troubleshooter

If the page does not start, loads slowly, or saves fail, open the **Troubleshooter** (the link *Page not loading or sign-in failing? Run the troubleshooter* on the lock screen, the menu entry, or the address ending `#doctor`). It works before you sign in and changes nothing. It checks one by one: the browser (secure page, storage, encryption, features), the files of this page, the fonts, GitHub (reachable, requests left, the clock), and after you sign in the repository (exists, can write), the public site, the vault, the data files, the History and who is signed in. Each problem comes with what to do about it; **Copy report** copies the whole result to send to whoever helps you (it contains no password, token or key). If the page cannot start at all, a diagnostics box appears instead of a blank page and names the files that did not load.

### Reports

**Reports**: choose the type (finance, **costs**, BOM, production, satisfaction, **history**, or one of the operations reports described above), the client or project (or all), and optionally a date range; the operations reports have their own filters (category, supplier, status, type, shipment). The report is drawn as an A4 sheet with the company logo, today's date, KPI tiles, charts and tables, in the current language and always in light colours.

- **Print / Save as PDF**: opens the browser print dialog. Choose *Save as PDF* as the printer. The sheet asks the browser to print its colours; if yours still prints them grey, turn on *Background graphics* in the print options.
- **Excel**: downloads an `.xlsx` with a summary sheet, one sheet per table and a Charts sheet of **real Excel charts** (editable in Excel, not pictures), with the logo and the date. In Arabic the sheets open right to left.

### Settings

- **Client rating inbox** (4.4): the address of your Google Apps Script (public, it goes into the company profile), a private **pick-up key** (*Make a new key* creates one), and **Test the connection**. Steps: [INBOX.md](INBOX.md). Leave empty to keep sending ratings by WhatsApp, e-mail or copy.
- **Company profile** (public!): name in English and Arabic, tagline, phone, WhatsApp (digits with country code), e-mail, website (must start with `https://`), address, logo (PNG, JPG or WebP under about 150 KB after resizing; the default DUSUR logo is a placeholder you can replace). These appear on the client site and on reports. Saving publishes them. Do not put anything private here.
- **Contract and signature** (private, never published):
  - *Owner name and title* in English and Arabic (printed under the signature).
  - *Signature*: **Draw** it with the mouse or your finger on the pad and press **Use this signature**, or **Upload an image** (a photo or scan of your signature on white paper: the white becomes transparent, the ink is kept). **Remove** deletes it. Without a signature the contract prints an empty line and warns you.
  - *Default language*, *default warranty* in months (0 to 120) and whether the client gets a signature box.
  - *Standard clauses* in Arabic and English. Separate clauses with a blank line; the first line of a clause is its heading. Use `{company} {client} {project} {sku} {price} {start} {due} {warranty} {date} {owner}` where the contract should fill in a value. **Restore standard text** brings the shipped clauses back.
- **Look and print** (4.5): the English and Arabic font (Google Fonts, or the device's own), the **accent colour** (the page nudges it until it is readable in both themes and shows the contrast), and the paper size. The look is published to the client site too.
- **Internal codes** (4.5), **Cost categories** (4.5: your own direct and indirect categories, English and Arabic names; removing one makes it read as *Other*) and **Settings file** (4.5): *Export* saves the settings (profile, defaults, contract wording, codes, cost categories, look, paper) as a small file; *Load* on another installation fills the form from it. It never carries passwords, tokens, keys, the inbox address or the project types, and nothing changes until you press **Save**.
- **Business defaults**: ID/SKU prefix (1 to 6 letters or digits, default `DS`), currency (3-letter code such as EGP, USD, SAR), default project duration in days (0 leaves the due date empty), report footer text (English and Arabic), whether to ask clients for ratings.
- **This device**: lock after inactivity.
- **Project types**: each has a code (2 to 5 letters or digits, used in SKUs, fixed after saving), English and Arabic names, and default stages with checklist items. Eight types ship by default. Changing a type does not alter existing projects.

Changing the prefix affects **new** IDs and SKUs only.

### Configuration

- **Connection**: GitHub user, repository, token, and the admin password. Leave the token and password fields blank to keep the stored ones. *Test connection* reports the repository, public or private, and whether the token can write.
- **Use on another device**: *Create connection code*, paste it into the other device's *Import connection code* box, then unlock there with the same password.
- **Reset**: removes this browser's stored connection.

## Part 2: Client

The client opens your site (`https://<user>.github.io/<repo>/`) or their private link.

### Live search

Type a **Client ID** (`DS-CL-1001`) or a **project number** (`DS-KIT-2610-0001`). Results appear as the person types. A found project asks for the **secret key** (`XXXX-XXXX-XXXX-XXXX`). The page also shows your contact buttons (call, WhatsApp, e-mail) and your address from your company profile.

### Private link

`https://<user>.github.io/<repo>/#client/<id>` goes straight to the secret-key form for that client. After the key is accepted, the portal shows:

- **Progress ring** and project state (pending, in progress, completed).
- **Time left** as a tape-measure countdown (or overdue / due today).
- **Money**: price, paid, remaining, payment history, and (4.5) the **next payment** with its date and the list of agreed instalments, when you set a collection schedule.
- **Stages** with their checklists, and **parts** with their status.
- **Photos and videos**: tap to enlarge. The viewer zooms (buttons, double tap, `+` `-` `0`), moves with the arrow keys or a swipe, and plays a video that is kept in the portal.
- **Down payment** and **Next payment** boxes, when the schedule has them.
- **Files to download**: the 3D models, drawings and documents you added for this project; they are saved to the device, not opened.
- **Save our contact**: adds the company to the phone's contacts (a `.vcf` card from your public profile).
- **Updates**: the page refreshes itself every 60 seconds while visible, and has a **Refresh** button.
- A **rating box** when the project is completed.
- Your contact buttons.

Everything is decrypted in the client's browser; the key is never sent anywhere. A wrong key shows "Access denied" with a short, growing delay before the next try.

### Rating

The client picks a score from 1 to 10 and optionally writes a comment. If you set up the rating inbox the button reads **Send my rating** and the rating goes straight to you: the page says **Sent. Thank you!**, or **Sent, not confirmed** (it went out but the phone could not read the answer, usually fine) or **Not sent yet** (no connection; the rating stays on the phone and **Try again** sends it). Without an inbox the button reads **Prepare my rating** and the page offers to send it by WhatsApp or e-mail (using your contacts) or to copy it. WhatsApp, e-mail and copy stay available as backups. The comment is encrypted with the client's key in the phone before it leaves; only you can read it. Until it is sent the client can change their rating later; the newest one wins.

## Fonts

English is set in **IBM Plex Sans** and Arabic in **IBM Plex Sans Arabic**, on both sites and on the printed papers. They load from Google Fonts after the page has appeared, so the first moment may show your phone's own font; if the fonts cannot be reached the page simply keeps the system font. To serve the fonts from your own repository instead (faster, no third party): see [tools/README.md](../tools/README.md#get-fontspy-self-host-the-ibm-plex-fonts).

## Tips

- Send the **link** and the **key** by different channels.
- Use a long, memorable **admin password** (four random words works well) and keep it somewhere safe. It cannot be reset.
- Revoke and replace the GitHub token if a device is lost; change the admin password in Configuration at the same time.
- During a large photo upload, keep the tab open until the green "uploaded" message appears. Each photo is committed to GitHub one by one, so a closed tab leaves the remaining ones out.
