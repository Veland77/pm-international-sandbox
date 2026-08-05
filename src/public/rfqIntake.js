// src/public/rfqIntake.js
// Client-side behavior for the New RFQ form: toggling existing/new account
// fields, filtering the contact dropdown to the selected account, and
// adding/removing line-item rows without a page reload. Plain vanilla JS,
// no build step or dependency — options are embedded server-side as JSON
// in window.__RFQ_FORM_OPTIONS__.

(function () {
  const options = window.__RFQ_FORM_OPTIONS__ || { contacts: [], materials: [], productForms: [], standards: [] };

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
    contactSelect.innerHTML =
      '<option value="">Select contact</option>' +
      contacts.map((c) => `<option value="${c.id}">${c.name} (${c.title})</option>`).join("");
  }

  function toggleAccountMode() {
    const checked = document.querySelector('input[name="account_mode"]:checked');
    const existingFields = document.getElementById("existing-account-fields");
    const newFields = document.getElementById("new-account-fields");
    if (!checked || !existingFields || !newFields) return;

    const isNew = checked.value === "new";
    existingFields.style.display = isNew ? "none" : "";
    newFields.style.display = isNew ? "" : "none";
  }

  function lineItemRowHtml(index) {
    return `
      <tr class="line-item-row">
        <td><select name="line_items[${index}][material_id]" required>${buildOptionsHtml(options.materials, "id", (m) => m.name, "Select material")}</select></td>
        <td><select name="line_items[${index}][product_form_id]" required>${buildOptionsHtml(options.productForms, "id", (f) => f.name, "Select product form")}</select></td>
        <td><select name="line_items[${index}][standard_id]">${buildOptionsHtml(options.standards, "id", (s) => s.code, "(none)")}</select></td>
        <td><textarea class="auto-grow" name="line_items[${index}][description]" required></textarea></td>
        <td><input type="number" name="line_items[${index}][quantity]" min="1" required></td>
        <td><input type="text" name="line_items[${index}][unit]" required></td>
        <td><input type="number" step="0.1" name="line_items[${index}][length_m]"></td>
        <td><button type="button" class="btn btn-secondary remove-line-item">Remove</button></td>
      </tr>`;
  }

  function addLineItemRow() {
    const body = document.getElementById("line-items-body");
    if (!body) return;
    const nextIndex = body.querySelectorAll(".line-item-row").length;
    body.insertAdjacentHTML("beforeend", lineItemRowHtml(nextIndex));

    // Wire up the same auto-grow/live-validation behavior app.js applies
    // on page load, scoped to just the row we added.
    const newRow = body.lastElementChild;
    if (newRow && window.PMSandbox) {
      window.PMSandbox.wireAll(newRow);
    }
  }

  document.addEventListener("DOMContentLoaded", () => {
    document.querySelectorAll('input[name="account_mode"]').forEach((el) => {
      el.addEventListener("change", toggleAccountMode);
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
