// Calendar variables
let currentWeekStart = getMonday(new Date());
let selectedDate = null;
let selectedStartIndex = null;
let selectedEndIndex = null;
let isResizing = false;
let resizeDirection = null; // 'top' or 'bottom'

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

      // Check if slot is available
      if (isSlotAvailable(dayOfWeek, timeSlot, slotDate)) {
        slot.classList.add('available');
        slot.addEventListener('click', (e) => selectSingleSlot(e, slot, dateStr, getTimeSlotIndex(timeSlot)));
        slot.addEventListener('mousemove', (e) => updateResizeCursor(e, slot));
        slot.addEventListener('mouseleave', () => resetCursor());
        slot.addEventListener('mousedown', (e) => handleResizeStart(e, slot, dateStr));
      } else {
        slot.classList.add('unavailable');
        slot.disabled = true;
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

// Check if a time slot is available
function isSlotAvailable(dayOfWeek, timeSlot, slotDate) {
  const now = new Date();
  const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  const slotDay = new Date(slotDate.getFullYear(), slotDate.getMonth(), slotDate.getDate());

  // Past dates
  if (slotDay < today) return false;

  // Sundays
  if (dayOfWeek === 0) return false;

  // July 4th
  if (slotDate.getMonth() === 6 && slotDate.getDate() === 4) return false;

  // Past time slots on today
  if (slotDay.getTime() === today.getTime()) {
    const [time, period] = timeSlot.split(' ');
    let hour = parseInt(time.split(':')[0], 10);
    if (period === 'PM' && hour !== 12) hour += 12;
    if (period === 'AM' && hour === 12) hour = 0;
    if (hour <= now.getHours()) return false;
  }

  // Custom unavailable times (day uses Mon=0 ... Sun=6)
  const adjustedDay = dayOfWeek === 0 ? 6 : dayOfWeek - 1;
  for (const unavailable of unavailableTimes) {
    if (unavailable.allDay && unavailable.day === adjustedDay) return false;
    if (unavailable.times && unavailable.day === adjustedDay && unavailable.times.includes(timeSlot)) return false;
  }

  return true;
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

// Clear selection
function clearSelection() {
  document.querySelectorAll('.time-slot.selected').forEach(el => {
    el.classList.remove('selected');
  });
}

// Setup calendar navigation
function setupCalendarNavigation() {
  document.getElementById('prevWeek').addEventListener('click', () => {
    currentWeekStart.setDate(currentWeekStart.getDate() - 7);
    renderCalendar();
  });

  document.getElementById('nextWeek').addEventListener('click', () => {
    currentWeekStart.setDate(currentWeekStart.getDate() + 7);
    renderCalendar();
  });
}

// Setup form submission
function setupFormSubmission() {
  document.getElementById('scheduleForm').addEventListener('submit', async function (e) {
    e.preventDefault();

    if (!document.getElementById('lesson_date').value || !document.getElementById('time_slot').value) {
      alert('Please select a date and time slot.');
      return;
    }

    const statusEl = document.getElementById('formStatus');
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
