const ical = require('ical-generator');

/**
 * Strip characters illegal in RFC 5545 ICS property values.
 * Prevents CRLF injection into description/summary fields that would
 * break ICS line folding or forge additional VCALENDAR properties.
 */
function sanitize(text) {
  if (!text || typeof text !== 'string') return '';
  return text.replace(/\r?\n/g, ' ').replace(/[\x00-\x1F\x7F]/g, '').trim();
}

/**
 * Generate iCalendar (ICS) content from tasks
 * @param {Array} tasks - Array of task objects
 * @param {Object} user - User object
 * @returns {String} - ICS content string
 */
function generateCalendar(tasks, user) {
  const cal = ical({
    domain: 'taskflow.app',
    prodId: '//TaskFlow//TaskFlow Calendar//EN',
    method: 'PUBLISH',
    timezone: 'utc',
    uniqueId: `taskflow-${Date.now()}@ical.taskflow.app`,
  });

  tasks.forEach((task) => {
    const event = cal.createEvent({
      uid: `task-${task._id}@ical.taskflow.app`,
      summary: sanitize(task.title),
      description: sanitize(task.description),
      start: task.dueDate ? new Date(task.dueDate) : null,
      end: task.dueDate ? new Date(new Date(task.dueDate).getTime() + 3600000) : null, // +1 hour
      location: task.category ? `Category: ${task.category}` : '',
      url: `https://taskflow.app/tasks/${task._id}`,
      status: task.status === 'completed' ? 'CONFIRMED' : 'NEEDS-ACTION',
      created: task.createdAt,
      lastModified: task.updatedAt,
    });

    // Add attendees if task has assignees
    if (task.assignee) {
      event.attendee({
        name: task.assignee.name || task.assignee.email,
        email: task.assignee.email,
        role: 'REQ-PARTICIPANT',
        rsvp: true,
      });
    }

    // Add category
    if (task.priority) {
      event.category(task.priority);
    }

    // Add tags as categories
    if (task.tags && task.tags.length > 0) {
      event.categories(task.tags);
    }
  });

  return cal.toString();
}

/**
 * Generate ICS file download URL
 * @param {Array} tasks - Array of task objects
 * @param {Object} user - User object
 * @returns {Object} - Download info
 */
function getCalendarDownloadInfo(tasks, user) {
  const icsContent = generateCalendar(tasks, user);
  const filename = `tasks-${user.username}-${new Date().toISOString().split('T')[0]}.ics`;
  
  return {
    filename,
    content: icsContent,
    mimeType: 'text/calendar',
    size: Buffer.byteLength(icsContent, 'utf8'),
  };
}

/**
 * Generate Google Calendar URL for task
 * @param {Object} task - Task object
 * @returns {String} - Google Calendar URL
 */
function getGoogleCalendarUrl(task) {
  const base = 'https://calendar.google.com/calendar/r/eventedit';
  const params = new URLSearchParams({
    text: sanitize(task.title),
    dates: task.dueDate ? `${new Date(task.dueDate).toISOString().replace(/-|:|\.\d{3}/g, '')}/${new Date(new Date(task.dueDate).getTime() + 3600000).toISOString().replace(/-|:|\.\d{3}/g, '')}` : '',
    details: sanitize(task.description),
    location: sanitize(task.category),
  });

  return `${base}?${params.toString()}`;
}

/**
 * Generate Outlook Calendar URL for task
 * @param {Object} task - Task object
 * @returns {String} - Outlook Calendar URL
 */
function getOutlookCalendarUrl(task) {
  const base = 'https://outlook.live.com/calendar/0/deeplink/compose';
  const params = new URLSearchParams({
    subject: sanitize(task.title),
    body: sanitize(task.description),
    startdt: task.dueDate ? new Date(task.dueDate).toISOString() : '',
    enddt: task.dueDate ? new Date(new Date(task.dueDate).getTime() + 3600000).toISOString() : '',
    location: sanitize(task.category),
    path: '/calendar/action/compose',
  });

  return `${base}?${params.toString()}`;
}

/**
 * Generate Apple Calendar URL for task
 * @param {Object} task - Task object
 * @returns {String} - Apple Calendar URL
 */
function getAppleCalendarUrl(task) {
  const startDate = task.dueDate ? new Date(task.dueDate) : new Date();
  const endDate = task.dueDate ? new Date(new Date(task.dueDate).getTime() + 3600000) : new Date(Date.now() + 3600000);
  
    const base = 'webcal://calendar.google.com/calendar/publish';
  const path = `/${encodeURIComponent(sanitize(task.title))}`;
  const params = new URLSearchParams({
    start: startDate.toISOString(),
    end: endDate.toISOString(),
    details: sanitize(task.description),
    location: sanitize(task.category),
  });

  return `${base}${path}?${params.toString()}`;
}

module.exports = {
  generateCalendar,
  getCalendarDownloadInfo,
  getGoogleCalendarUrl,
  getOutlookCalendarUrl,
  getAppleCalendarUrl,
};
