// src/public/emailIntakeReview.js
// Client-side behavior for the AI Email Intake review form: the 3-way
// sender mode toggle (matched / existing-account-new-contact / new),
// filtering the contact dropdown when "matched" is selected, and
// adding/removing line-item rows — same add/remove pattern as
// rfqIntake.js, not reused directly since the row shape here (match
// badges, skip checkbox, hidden AI-match fields) is different enough to
// not share a template cleanly.

(function () {
  const options = window.__EMAIL_INTAKE_OPTIONS__ || { contacts: [], materials: [], productForms: [], standards: [] };

  function buildOptionsHtml(items, valueKey, labelFn, blankLabel) {
    const blank = `<option value="">${blankLabel}</option>`;
    const rest = items.map((item) => `<option value="${item[valueKey]}">${labelFn(item)}</option>`).join("");
    return blank + rest;
  }

  function refreshContactOptions() {
    const accountSelect = document.getElementById("account_id");
    const contactSelect = document.getElementById("contact_id");
    if (!accountSelect || !contactSelect) return;

    const accountId = accountSelect.value;
    const contacts = options.contacts.filter((c) => String(c.account_id) === accountId);
    // The server hands us the contact that should be preselected — either
    // the exact-email match, or whatever the user had actually chosen
    // before a failed submit — via a data attribute, since this function
    // rebuilds the option list from scratch and would otherwise reset the
    // dropdown to blank every time it runs.
    const preselect = contactSelect.dataset.selectedContactId || "";
    contactSelect.innerHTML =
      '<option value="">Select contact</option>' +
      contacts.map((c) => `<option value="${c.id}"${String(c.id) === preselect ? " selected" : ""}>${c.name} (${c.title})</option>`).join("");
    // Only honor it once: later refreshes triggered by the user actually
    // changing the account dropdown should default to blank, not keep
    // forcing the original match back.
    delete contactSelect.dataset.selectedContactId;
  }

  function applySenderMode() {
    const checked = document.querySelector('input[name="sender_mode"]:checked');
    const existingAccountFields = document.getElementById("existing-account-fields");
    const matchedContactField = document.getElementById("matched-contact-field");
    const newContactFields = document.getElementById("new-contact-fields");
    const newAccountFields = document.getElementById("new-account-fields");
    if (!checked || !existingAccountFields || !newContactFields || !newAccountFields) return;

    const mode = checked.value;
    existingAccountFields.style.display = mode === "matched" || mode === "existingAccountNewContact" ? "" : "none";
    if (matchedContactField) matchedContactField.style.display = mode === "matched" ? "" : "none";
    newContactFields.style.display = mode === "existingAccountNewContact" || mode === "new" ? "" : "none";
    newAccountFields.style.display = mode === "new" ? "" : "none";
  }

  // A manually-added row has nothing AI-flagged to note — no badge, no
  // skip checkbox, and the hidden "originally matched" fields are left
  // "true"/empty so buildCatalogMatchNote (server-side) never treats it
  // as a forced stand-in.
  function lineItemRowHtml(index) {
    return `
      <tr class="email-intake-line-row">
        <td><select name="line_items[${index}][material_id]">${buildOptionsHtml(options.materials, "id", (m) => m.name, "Select material")}</select></td>
        <td><select name="line_items[${index}][product_form_id]">${buildOptionsHtml(options.productForms, "id", (f) => f.name, "Select product form")}</select></td>
        <td><select name="line_items[${index}][standard_id]">${buildOptionsHtml(options.standards, "id", (s) => s.code, "(none)")}</select></td>
        <td><textarea class="auto-grow" name="line_items[${index}][description]"></textarea></td>
        <td><input type="number" name="line_items[${index}][quantity]" min="1"></td>
        <td><input type="text" name="line_items[${index}][unit]"></td>
        <td><input type="number" step="0.1" name="line_items[${index}][length_m]"></td>
        <td></td>
        <td>
          <button type="button" class="btn btn-secondary remove-line-item">Remove</button>
          <input type="hidden" name="line_items[${index}][raw_text]" value="">
          <input type="hidden" name="line_items[${index}][material_originally_matched]" value="true">
          <input type="hidden" name="line_items[${index}][material_as_written]" value="">
          <input type="hidden" name="line_items[${index}][product_form_originally_matched]" value="true">
          <input type="hidden" name="line_items[${index}][product_form_as_written]" value="">
          <input type="hidden" name="line_items[${index}][standard_originally_matched]" value="true">
          <input type="hidden" name="line_items[${index}][standard_as_written]" value="">
        </td>
      </tr>`;
  }

  // Monotonically increasing, never reused — counting current rows in the
  // DOM instead would collide after a remove-then-add (e.g. 3 rows
  // 0/1/2, remove row 1, add: a DOM-count-based index would reissue "2",
  // duplicating row 2's existing field names rather than adding a
  // genuinely new row, silently corrupting whichever one submits last).
  let nextLineItemIndex = document.querySelectorAll(".email-intake-line-row").length;

  function addLineItemRow() {
    const body = document.getElementById("line-items-body");
    if (!body) return;
    body.insertAdjacentHTML("beforeend", lineItemRowHtml(nextLineItemIndex));
    nextLineItemIndex++;

    const newRow = body.lastElementChild;
    if (newRow && window.PMSandbox) {
      window.PMSandbox.wireAll(newRow);
    }
  }

  document.addEventListener("DOMContentLoaded", () => {
    document.querySelectorAll('input[name="sender_mode"]').forEach((el) => {
      el.addEventListener("change", applySenderMode);
    });

    const accountSelect = document.getElementById("account_id");
    if (accountSelect) accountSelect.addEventListener("change", refreshContactOptions);
    refreshContactOptions();

    const addButton = document.getElementById("add-line-item");
    if (addButton) addButton.addEventListener("click", addLineItemRow);

    const lineItemsBody = document.getElementById("line-items-body");
    if (lineItemsBody) {
      lineItemsBody.addEventListener("click", (e) => {
        if (e.target.classList.contains("remove-line-item")) {
          e.target.closest("tr").remove();
        }
      });
    }
  });
})();
