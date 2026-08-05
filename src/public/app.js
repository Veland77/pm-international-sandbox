// src/public/app.js
// Shared vanilla JS behaviors, loaded on every page: custom file inputs,
// English-locked date-field display, auto-growing textareas, and live
// inline validation with hand-written English messages (not the browser's
// native validationMessage, which is itself locale-dependent). Exposed on
// window.PMSandbox so page-specific scripts (e.g. rfqIntake.js) can wire
// the same behaviors onto elements they add dynamically.

(function () {
  const MONTH_NAMES = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];

  function formatEnglishDate(isoString) {
    if (!isoString) return "Select a date";
    const [year, month, day] = isoString.split("-").map(Number);
    if (!year || !month || !day) return "Select a date";
    return `${day} ${MONTH_NAMES[month - 1]} ${year}`;
  }

  function wireDateField(wrapper) {
    const input = wrapper.querySelector('input[type="date"]');
    const display = wrapper.querySelector(".date-field-display");
    if (!input || !display) return;

    const update = () => {
      display.textContent = formatEnglishDate(input.value);
    };
    update();
    input.addEventListener("change", update);
    input.addEventListener("input", update);
  }

  function wireFileInput(wrapper) {
    const input = wrapper.querySelector(".file-input-native");
    const filenameSpan = wrapper.querySelector(".file-input-filename");
    if (!input || !filenameSpan) return;

    input.addEventListener("change", () => {
      filenameSpan.textContent = input.files.length ? input.files[0].name : "No file chosen";
    });
  }

  function autoGrowTextarea(el) {
    el.style.height = "auto";
    el.style.height = `${el.scrollHeight}px`;
  }

  function wireAutoGrowTextarea(el) {
    autoGrowTextarea(el);
    el.addEventListener("input", () => autoGrowTextarea(el));
  }

  function englishValidationMessage(el) {
    const validity = el.validity;
    if (validity.valueMissing) return "This field is required.";
    if (validity.typeMismatch) return "Enter a valid value.";
    if (validity.rangeUnderflow) return `Value must be at least ${el.min}.`;
    if (validity.tooShort) return `Enter at least ${el.minLength} characters.`;
    return "This value isn't valid.";
  }

  function validateField(el) {
    const wrapper = el.closest(".field") || el.parentElement;
    let message = wrapper.querySelector(".field-error-message");

    if (!el.checkValidity()) {
      el.classList.add("field-invalid");
      if (!message) {
        message = document.createElement("span");
        message.className = "field-error-message";
        wrapper.appendChild(message);
      }
      message.textContent = englishValidationMessage(el);
    } else {
      el.classList.remove("field-invalid");
      if (message) message.remove();
    }
  }

  function wireLiveValidation(el) {
    el.addEventListener("blur", () => validateField(el));
    el.addEventListener("input", () => {
      if (el.classList.contains("field-invalid")) validateField(el);
    });
  }

  function wireAll(root) {
    root.querySelectorAll(".date-field-wrapper").forEach(wireDateField);
    root.querySelectorAll(".file-input").forEach(wireFileInput);
    root.querySelectorAll("textarea.auto-grow").forEach(wireAutoGrowTextarea);
    root.querySelectorAll("input[required], select[required], textarea[required]").forEach(wireLiveValidation);
  }

  document.addEventListener("DOMContentLoaded", () => wireAll(document));

  window.PMSandbox = {
    formatEnglishDate,
    wireDateField,
    wireFileInput,
    wireAutoGrowTextarea,
    wireLiveValidation,
    wireAll,
  };
})();
