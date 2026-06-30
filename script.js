// Scheduler form submission
// Sends a "lesson request" email to Jake via EmailJS.
// Setup required (one-time, free):
//   1. Create an account at https://www.emailjs.com
//   2. Add an Email Service (e.g. Gmail) connected to jbsor2007@gmail.com
//   3. Create an Email Template with variables: full_name, email, lesson_date, time_slot, tail_number
//   4. Replace YOUR_PUBLIC_KEY in index.html, and YOUR_SERVICE_ID / YOUR_TEMPLATE_ID below

document.getElementById('scheduleForm').addEventListener('submit', function (e) {
  e.preventDefault();

  const statusEl = document.getElementById('formStatus');
  statusEl.textContent = 'Sending request...';

  emailjs.sendForm('YOUR_SERVICE_ID', 'YOUR_TEMPLATE_ID', this)
    .then(function () {
      statusEl.textContent = 'Request sent! Jake will confirm by email shortly.';
      document.getElementById('scheduleForm').reset();
    }, function (error) {
      statusEl.textContent = 'Something went wrong. Please try again or email jbsor2007@gmail.com directly.';
      console.error('EmailJS error:', error);
    });
});
