/**
 * Phase 6 starter templates — onboarding accelerators only.
 *
 * Each entry creates ORDINARY tasks (same Task model, same categories/tags the
 * user could have typed by hand). There are no separate product modes or
 * special data models: applying a starter is a bulk Task.create with familiar
 * fields, so the result behaves exactly like hand-entered work in Inbox,
 * Today, projects, calendar and search.
 */
const STARTER_TEMPLATES = [
  {
    key: 'personal-weekly-plan',
    title: 'Personal weekly plan',
    description: 'A calm week: plan three priorities, clear small errands, and review on Friday.',
    category: 'personal',
    tags: ['weekly-plan'],
    tasks: [
      { title: 'Choose my Top Three for the week', description: 'Pick three outcomes that would make this week feel done.', category: 'personal', priority: 'high', tags: ['weekly-plan', 'priorities'], estimatedTime: 15, status: 'pending' },
      { title: 'Plan meals for the week', description: 'Groceries list + 3 simple dinners.', category: 'personal', priority: 'medium', tags: ['weekly-plan', 'home'], estimatedTime: 30, status: 'backlog' },
      { title: 'Tidy desk and inbox sweep', description: '15-minute reset: desk, downloads, and task inbox.', category: 'personal', priority: 'low', tags: ['weekly-plan', 'reset'], estimatedTime: 15, status: 'backlog' },
      { title: 'Book appointments and errands', description: 'Health, car, or household bookings waiting on you.', category: 'personal', priority: 'medium', tags: ['weekly-plan', 'errands'], estimatedTime: 20, status: 'backlog' },
      { title: 'Friday review: what got done?', description: 'Look at completed work, clear leftovers, pick next week.', category: 'personal', priority: 'medium', tags: ['weekly-plan', 'review'], estimatedTime: 20, status: 'backlog' },
    ],
  },
  {
    key: 'student-semester-planner',
    title: 'Student semester planner',
    description: 'One project per course plus study rhythm — all ordinary tasks and labels.',
    category: 'college',
    tags: ['semester'],
    tasks: [
      { title: 'List all courses and deadlines', description: 'Syllabus sweep: exams, papers, labs with dates.', category: 'college', priority: 'high', tags: ['semester', 'planning'], estimatedTime: 45, status: 'pending' },
      { title: 'Set weekly study blocks', description: 'Two focused blocks per hard course.', category: 'college', priority: 'medium', tags: ['semester', 'study'], estimatedTime: 30, status: 'backlog' },
      { title: 'Start first assignment early', description: 'Outline only — beat the rush.', category: 'college', priority: 'high', tags: ['semester', 'assignment'], estimatedTime: 60, status: 'backlog' },
      { title: 'Organise notes and readings', description: 'One folder per course; file this week’s readings.', category: 'college', priority: 'low', tags: ['semester', 'notes'], estimatedTime: 30, status: 'backlog' },
      { title: 'Mid-semester check-in', description: 'Grades so far? Office hours for the shakiest course.', category: 'college', priority: 'medium', tags: ['semester', 'review'], estimatedTime: 20, status: 'backlog' },
    ],
  },
  {
    key: 'freelancer-client-work',
    title: 'Freelancer client work',
    description: 'Track one client engagement from kickoff to invoice with plain tasks.',
    category: 'work',
    tags: ['freelance'],
    tasks: [
      { title: 'Kickoff: confirm scope and deadline', description: 'Deliverables, revisions, and payment terms in writing.', category: 'work', priority: 'critical', tags: ['freelance', 'kickoff'], estimatedTime: 30, status: 'pending' },
      { title: 'Draft milestone 1', description: 'First reviewable cut for the client.', category: 'work', priority: 'high', tags: ['freelance', 'delivery'], estimatedTime: 180, status: 'backlog' },
      { title: 'Incorporate client feedback', description: 'Log each comment as a subtask so nothing slips.', category: 'work', priority: 'medium', tags: ['freelance', 'feedback'], estimatedTime: 90, status: 'backlog' },
      { title: 'Final delivery and handover', description: 'Files, docs, and a short handover note.', category: 'work', priority: 'high', tags: ['freelance', 'delivery'], estimatedTime: 60, status: 'backlog' },
      { title: 'Send invoice and follow up', description: 'Invoice the day you deliver; nudge in 7 days.', category: 'work', priority: 'medium', tags: ['freelance', 'invoice'], estimatedTime: 15, status: 'backlog' },
    ],
  },
  {
    key: 'small-team-sprint',
    title: 'Small team sprint',
    description: 'A one-week sprint: goal, tasks, review. Works with assignees and labels.',
    category: 'projects',
    tags: ['sprint'],
    tasks: [
      { title: 'Sprint goal: write one sentence', description: 'What will we demo on Friday?', category: 'projects', priority: 'high', tags: ['sprint', 'planning'], estimatedTime: 20, status: 'pending' },
      { title: 'Pull top tasks into the sprint', description: 'Move 5–8 small tasks to This Week; assign owners.', category: 'projects', priority: 'high', tags: ['sprint', 'planning'], estimatedTime: 30, status: 'backlog' },
      { title: 'Daily check: unblock each other', description: 'What moved, what is stuck, who needs help.', category: 'projects', priority: 'medium', tags: ['sprint', 'standup'], estimatedTime: 15, status: 'backlog' },
      { title: 'Demo and review', description: 'Show working stuff; note what to improve.', category: 'projects', priority: 'medium', tags: ['sprint', 'review'], estimatedTime: 45, status: 'backlog' },
      { title: 'Retro: keep / fix / try', description: 'Three lists, five minutes each. No blame.', category: 'projects', priority: 'low', tags: ['sprint', 'retro'], estimatedTime: 30, status: 'backlog' },
    ],
  },
];

module.exports = { STARTER_TEMPLATES };
