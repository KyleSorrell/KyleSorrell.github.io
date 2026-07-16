// Calendar variables
let currentWeekStart = getMonday(new Date());
let selectedDate = null;
let selectedStartIndex = null;
let selectedEndIndex = null;
let isResizing = false;
let resizeDirection = null; // 'top' or 'bottom'

// Mobile: which day column (Mon=0 … Sun=6) is currently shown
let mobileSelectedDay = (() => {
  const d = new Date().getDay(); // 0=Sun … 6=Sat
  return d === 0 ? 0 : d - 1;   // Mon-based; Sunday → Monday
})();

// Mobile: pending start (30-min grid index) and chosen duration
let mobilePendingStartIndex = null;
let mobileDurationSlots = 2; // default 1 hour

const DURATION_OPTIONS = [
  { label: '30 min', slots: 1 },
  { label: '1 hr',   slots: 2 },
  { label: '1.5 hr', slots: 3 },
  { label: '2 hr',   slots: 4 },
  { label: '2.5 hr', slots: 5 },
  { label: '3 hr',   slots: 6 },
];

// Add entries here to block off specific days or times.
// `day` uses Mon=0 ... Sun=6. `allDay: true` blocks the whole day.
const unavailableTimes = [];

// Initialize calendar on page load
document.addEventListener('DOMContentLoaded', function () {
  renderCalendar();
  setupCalendarNavigation();
  setupFormSubmission();
});

// Get the Monday of the current week
function getMonday(date) {
  const d = new Date(date);
  const day = d.getDay();
  const diff = d.getDate() - day + (day === 0 ? -6 : 1);
  return new Date(d.setDate(diff));
}

// Format date as YYYY-MM-DD using local timezone
function formatDate(date) {
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, '0');
  const d = String(date.getDate()).padStart(2, '0');
  return `${y}-${m}-${d}`;
}

// Render the weekly calendar
function renderCalendar() {
  const weekEnd = new Date(currentWeekStart);
  weekEnd.setDate(weekEnd.getDate() + 6);

  // Update week display
  const weekDisplay = `${currentWeekStart.toLocaleDateString('en-US', { month: 'short', day: 'numeric' })} - ${weekEnd.toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}`;
  document.getElementById('currentWeek').textContent = weekDisplay;

  // Create header (days of week)
  const headerContainer = document.getElementById('calendarHeader');
  headerContainer.innerHTML = '<div></div>'; // Empty corner cell
  const days = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'];
  days.forEach((day, i) => {
    const d = new Date(currentWeekStart);
    d.setDate(d.getDate() + i);
    const dateStr = d.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
    const dayEl = document.createElement('div');
    dayEl.innerHTML = `${day}<br>${dateStr}`;
    headerContainer.appendChild(dayEl);
  });

  // Mobile calendar (day-strip + time list)
  renderMobileCalendar();

  // Create time slots grid
  const gridContainer = document.getElementById('calendarGrid');
  gridContainer.innerHTML = '';

  const timeSlots = generateTimeSlots();

  timeSlots.forEach(timeSlot => {
    // Time label column
    const timeLabel = document.createElement('div');
    timeLabel.className = 'time-label';
    timeLabel.textContent = timeSlot;
    gridContainer.appendChild(timeLabel);

    // One slot for each day of the week
    for (let dayOffset = 0; dayOffset < 7; dayOffset++) {
      const slotDate = new Date(currentWeekStart);
      slotDate.setDate(slotDate.getDate() + dayOffset);
      const dateStr = formatDate(slotDate);
      const dayOfWeek = slotDate.getDay();

      const slot = document.createElement('button');
      slot.type = 'button';
      slot.className = 'time-slot';
      slot.dataset.date = dateStr;
      slot.dataset.time = timeSlot;
      slot.dataset.index = getTimeSlotIndex(timeSlot);

      if (isHardUnavailable(dayOfWeek, timeSlot, slotDate)) {
        slot.classList.add('unavailable');
        slot.disabled = true;
      } else if (isPastSlot(timeSlot, slotDate)) {
        // Past slots look available but clicking notifies the client
        slot.classList.add('available');
        slot.addEventListener('click', () => showPastSlotMessage());
      } else {
        slot.classList.add('available');
        slot.addEventListener('click', (e) => selectSingleSlot(e, slot, dateStr, getTimeSlotIndex(timeSlot)));
        slot.addEventListener('mousemove', (e) => updateResizeCursor(e, slot));
        slot.addEventListener('mouseleave', () => resetCursor());
        slot.addEventListener('mousedown', (e) => handleResizeStart(e, slot, dateStr));
      }

      gridContainer.appendChild(slot);
    }
  });
}

// Generate 30-minute time slots from 8:00 AM to 6:00 PM
function generateTimeSlots() {
  const slots = [];
  const startHour = 8;
  const endHour = 18; // 6 PM

  for (let hour = startHour; hour < endHour; hour++) {
    slots.push(formatTime(hour, 0));
    slots.push(formatTime(hour, 30));
  }
  return slots;
}

// Format time as "H:MM AM/PM"
function formatTime(hour, minutes) {
  const period = hour >= 12 ? 'PM' : 'AM';
  const displayHour = hour > 12 ? hour - 12 : hour === 0 ? 12 : hour;
  const displayMinutes = minutes === 0 ? '00' : '30';
  return `${displayHour}:${displayMinutes} ${period}`;
}

// Returns true if this slot is blocked for a non-time reason (Sunday, holiday, custom)
// These slots are greyed out and unclickable.
function isHardUnavailable(dayOfWeek, timeSlot, slotDate) {
  if (dayOfWeek === 0) return true; // Sundays
  if (slotDate.getMonth() === 6 && slotDate.getDate() === 4) return true; // July 4th

  const adjustedDay = dayOfWeek === 0 ? 6 : dayOfWeek - 1;
  for (const unavailable of unavailableTimes) {
    if (unavailable.allDay && unavailable.day === adjustedDay) return true;
    if (unavailable.times && unavailable.day === adjustedDay && unavailable.times.includes(timeSlot)) return true;
  }
  return false;
}

// Returns true if this slot is in the past (shown normally but clicking shows a message)
function isPastSlot(timeSlot, slotDate) {
  const now = new Date();
  const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  const slotDay = new Date(slotDate.getFullYear(), slotDate.getMonth(), slotDate.getDate());

  if (slotDay < today) return true;

  if (slotDay.getTime() === today.getTime()) {
    const [time, period] = timeSlot.split(' ');
    let hour = parseInt(time.split(':')[0], 10);
    if (period === 'PM' && hour !== 12) hour += 12;
    if (period === 'AM' && hour === 12) hour = 0;
    if (hour <= now.getHours()) return true;
  }

  return false;
}

// Show a message when a past slot is clicked
function showPastSlotMessage() {
  const display = document.getElementById('selectedSlotDisplay');
  const text = document.getElementById('selectedSlotText');
  text.textContent = 'That time has already passed — please select an upcoming slot.';
  display.style.display = 'block';
}

// Get index of a time slot
function getTimeSlotIndex(timeSlot) {
  const timeSlots = generateTimeSlots();
  return timeSlots.indexOf(timeSlot);
}

// Select a single slot
function selectSingleSlot(e, slot, dateStr, slotIndex) {
  e.stopPropagation();
  selectedDate = dateStr;
  selectedStartIndex = slotIndex;
  selectedEndIndex = slotIndex;
  updateSelection();
}

// Check if cursor is near top or bottom of slot (10px threshold)
function getResizeDirection(e, slot) {
  const rect = slot.getBoundingClientRect();
  const topThreshold = 10;
  const bottomThreshold = 10;

  const distFromTop = e.clientY - rect.top;
  const distFromBottom = rect.bottom - e.clientY;

  if (distFromTop < topThreshold && selectedStartIndex !== null) {
    return 'top';
  }
  if (distFromBottom < bottomThreshold && selectedEndIndex !== null) {
    return 'bottom';
  }
  return null;
}

// Update cursor based on position
function updateResizeCursor(e, slot) {
  if (selectedDate !== slot.dataset.date || selectedStartIndex === null) return;

  const direction = getResizeDirection(e, slot);
  if (direction === 'top' || direction === 'bottom') {
    slot.style.cursor = 'ns-resize';
  } else {
    slot.style.cursor = 'pointer';
  }
}

// Reset cursor
function resetCursor() {
  document.querySelectorAll('.time-slot').forEach(slot => {
    slot.style.cursor = 'pointer';
  });
}

// Handle resize start
function handleResizeStart(e, slot, dateStr) {
  if (dateStr !== selectedDate) return;

  const direction = getResizeDirection(e, slot);
  if (!direction) return;

  e.preventDefault();
  isResizing = true;
  resizeDirection = direction;

  const onMouseMove = (moveEvent) => handleResize(moveEvent, dateStr);
  const onMouseUp = () => {
    isResizing = false;
    resizeDirection = null;
    document.removeEventListener('mousemove', onMouseMove);
    document.removeEventListener('mouseup', onMouseUp);
    resetCursor();
  };

  document.addEventListener('mousemove', onMouseMove);
  document.addEventListener('mouseup', onMouseUp);
}

// Handle resizing
function handleResize(e, dateStr) {
  if (!isResizing) return;

  const slots = document.querySelectorAll(`[data-date="${dateStr}"]`);
  const hoveredSlot = document.elementFromPoint(e.clientX, e.clientY);

  if (hoveredSlot && hoveredSlot.classList.contains('time-slot') && hoveredSlot.dataset.date === dateStr) {
    const newIndex = parseInt(hoveredSlot.dataset.index);

    if (resizeDirection === 'top') {
      selectedStartIndex = Math.min(newIndex, selectedEndIndex);
    } else if (resizeDirection === 'bottom') {
      selectedEndIndex = Math.max(newIndex, selectedStartIndex);
    }

    updateSelection();
  }
}

// Update selection display
function updateSelection() {
  if (selectedStartIndex === null || selectedEndIndex === null) return;

  const timeSlots = generateTimeSlots();
  clearSelection();

  // Highlight selected slots
  document.querySelectorAll(`[data-date="${selectedDate}"]`).forEach(slot => {
    const slotIndex = parseInt(slot.dataset.index);
    if (slotIndex >= selectedStartIndex && slotIndex <= selectedEndIndex && slot.classList.contains('available')) {
      slot.classList.add('selected');
    }
  });

  // Update form
  const startTime = timeSlots[selectedStartIndex];
  const endTime = selectedEndIndex + 1 < timeSlots.length
    ? timeSlots[selectedEndIndex + 1]
    : '6:00 PM';

  document.getElementById('lesson_date').value = selectedDate;
  document.getElementById('time_slot').value = `${startTime} - ${endTime}`;

  // Show selected slot display (parse as local date to avoid timezone offset)
  const displayEl = document.getElementById('selectedSlotDisplay');
  const [y, m, d] = selectedDate.split('-').map(Number);
  const dateObj = new Date(y, m - 1, d);
  const dateFormatted = dateObj.toLocaleDateString('en-US', { weekday: 'long', month: 'short', day: 'numeric' });
  document.getElementById('selectedSlotText').textContent = `${dateFormatted} from ${startTime} to ${endTime}`;
  displayEl.style.display = 'block';
}

// Clear selection (covers both desktop grid cells and mobile list items)
function clearSelection() {
  document.querySelectorAll('.time-slot.selected, .time-list-item.selected').forEach(el => {
    el.classList.remove('selected');
  });
}

// Render mobile day-strip + time list (1-hour slots)
function renderMobileCalendar() {
  const dayStrip = document.getElementById('dayStrip');
  const timeList = document.getElementById('timeList');
  if (!dayStrip || !timeList) return;

  const dayAbbrevs = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'];
  const allSlots = generateTimeSlots(); // 30-min grid

  // Day strip
  dayStrip.innerHTML = '';
  for (let i = 0; i < 7; i++) {
    const d = new Date(currentWeekStart);
    d.setDate(d.getDate() + i);
    const chip = document.createElement('button');
    chip.type = 'button';
    chip.className = 'day-chip' + (i === mobileSelectedDay ? ' active' : '');
    chip.innerHTML =
      `<span class="chip-day">${dayAbbrevs[i]}</span>` +
      `<span class="chip-date">${d.getDate()}</span>`;
    const idx = i;
    chip.addEventListener('click', () => {
      mobileSelectedDay = idx;
      mobilePendingStartIndex = null;
      document.getElementById('durationPicker').style.display = 'none';
      renderMobileCalendar();
    });
    dayStrip.appendChild(chip);
  }

  // Time list — one row per hour (every other 30-min slot)
  const dayObj = new Date(currentWeekStart);
  dayObj.setDate(dayObj.getDate() + mobileSelectedDay);
  const dateStr = formatDate(dayObj);
  const dayOfWeek = dayObj.getDay();

  timeList.innerHTML = '';
  for (let i = 0; i < allSlots.length; i += 2) { // step by 2 = 1-hour increments
    const timeSlot = allSlots[i]; // e.g. "8:00 AM"
    const item = document.createElement('button');
    item.type = 'button';
    item.dataset.date = dateStr;
    item.dataset.index = String(i);
    item.textContent = timeSlot;

    if (isHardUnavailable(dayOfWeek, timeSlot, dayObj)) {
      item.className = 'time-list-item unavailable';
      item.disabled = true;
    } else if (isPastSlot(timeSlot, dayObj)) {
      item.className = 'time-list-item';
      item.addEventListener('click', showPastSlotMessage);
    } else {
      const isSelected = selectedDate === dateStr && mobilePendingStartIndex === i;
      item.className = 'time-list-item' + (isSelected ? ' selected' : '');
      item.addEventListener('click', () => selectMobileSlot(i, dateStr, item));
    }

    timeList.appendChild(item);
  }
}

// Called when a mobile time row is tapped
function selectMobileSlot(startIndex, dateStr, item) {
  mobilePendingStartIndex = startIndex;
  selectedDate = dateStr;

  // Highlight only the tapped row
  document.querySelectorAll('.time-list-item.selected').forEach(el => el.classList.remove('selected'));
  item.classList.add('selected');

  // Clear any desktop selection
  document.querySelectorAll('.time-slot.selected').forEach(el => el.classList.remove('selected'));

  applyMobileDuration();
  renderDurationPicker();
}

// Apply the current start + duration to form fields and the display label
function applyMobileDuration() {
  if (mobilePendingStartIndex === null) return;
  const allSlots = generateTimeSlots();
  const maxSlots = allSlots.length - mobilePendingStartIndex;
  const clampedDuration = Math.min(mobileDurationSlots, maxSlots);
  const endIndex = mobilePendingStartIndex + clampedDuration - 1;
  const endTime = endIndex + 1 < allSlots.length ? allSlots[endIndex + 1] : '6:00 PM';
  const startTime = allSlots[mobilePendingStartIndex];

  selectedStartIndex = mobilePendingStartIndex;
  selectedEndIndex = endIndex;

  document.getElementById('lesson_date').value = selectedDate;
  document.getElementById('time_slot').value = `${startTime} - ${endTime}`;

  const [y, m, d] = selectedDate.split('-').map(Number);
  const dateObj = new Date(y, m - 1, d);
  const dateFormatted = dateObj.toLocaleDateString('en-US', { weekday: 'long', month: 'short', day: 'numeric' });
  document.getElementById('selectedSlotText').textContent = `${dateFormatted} from ${startTime} to ${endTime}`;
  document.getElementById('selectedSlotDisplay').style.display = 'block';
}

// Render the duration option buttons
function renderDurationPicker() {
  const picker = document.getElementById('durationPicker');
  const container = document.getElementById('durationOptions');
  picker.style.display = 'block';

  const allSlots = generateTimeSlots();
  const maxSlots = allSlots.length - mobilePendingStartIndex;

  container.innerHTML = '';
  DURATION_OPTIONS.filter(opt => opt.slots <= maxSlots).forEach(opt => {
    const btn = document.createElement('button');
    btn.type = 'button';
    btn.textContent = opt.label;
    btn.className = 'duration-btn' + (opt.slots === mobileDurationSlots ? ' active' : '');
    btn.addEventListener('click', () => {
      mobileDurationSlots = opt.slots;
      applyMobileDuration();
      renderDurationPicker();
    });
    container.appendChild(btn);
  });
}

// Setup calendar navigation
function setupCalendarNavigation() {
  document.getElementById('prevWeek').addEventListener('click', () => {
    currentWeekStart.setDate(currentWeekStart.getDate() - 7);
    mobileSelectedDay = 0;
    mobilePendingStartIndex = null;
    document.getElementById('durationPicker').style.display = 'none';
    renderCalendar();
  });

  document.getElementById('nextWeek').addEventListener('click', () => {
    currentWeekStart.setDate(currentWeekStart.getDate() + 7);
    mobileSelectedDay = 0;
    mobilePendingStartIndex = null;
    document.getElementById('durationPicker').style.display = 'none';
    renderCalendar();
  });
}

// Setup form submission
function setupFormSubmission() {
  document.getElementById('scheduleForm').addEventListener('submit', async function (e) {
    e.preventDefault();

    const statusEl = document.getElementById('formStatus');

    if (!document.getElementById('lesson_date').value || !document.getElementById('time_slot').value) {
      statusEl.style.color = 'red';
      statusEl.textContent = 'Please select a time slot from the calendar before submitting.';
      return;
    }
    statusEl.textContent = 'Sending request...';

    try {
      const formData = {
        full_name: document.getElementById('full_name').value,
        email: document.getElementById('email').value,
        lesson_date: document.getElementById('lesson_date').value,
        time_slot: document.getElementById('time_slot').value,
        tail_number: document.getElementById('tail_number').value,
      };

      // Call Cloud Function to submit lesson request
      const response = await fetch(
        'https://us-central1-jake-sorrell-flight-lessons.cloudfunctions.net/submitLessonRequest',
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(formData),
        }
      );

      if (!response.ok) {
        throw new Error('Failed to submit request');
      }

      const { requestId } = await response.json();

      // Send email to Jake via EmailJS (client-side — avoids server-side restrictions)
      const base = 'https://kylesorrell.github.io';
      await emailjs.send('service_qjt49i4', 'template_sjocyhw', {
        name: formData.full_name,
        time: `${formData.lesson_date} at ${formData.time_slot}`,
        full_name: formData.full_name,
        email: formData.email,
        lesson_date: formData.lesson_date,
        time_slot: formData.time_slot,
        tail_number: formData.tail_number,
        confirmation_link: `${base}/confirm.html?id=${requestId}&action=confirm`,
        deny_link: `${base}/confirm.html?id=${requestId}&action=deny`,
      });

      statusEl.textContent = 'Request sent! Jake will confirm by email shortly.';
      document.getElementById('scheduleForm').reset();
      document.getElementById('selectedSlotDisplay').style.display = 'none';
      document.querySelectorAll('.time-slot.selected').forEach(el => el.classList.remove('selected'));
    } catch (error) {
      statusEl.textContent = 'Something went wrong. Please try again or email jbsor2007@gmail.com directly.';
      console.error('Error:', error);
    }
  });
}
