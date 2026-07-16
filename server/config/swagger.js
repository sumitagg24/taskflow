const swaggerJsdoc = require('swagger-jsdoc');

const options = {
  definition: {
    openapi: '3.0.0',
    info: {
      title: 'TaskFlow API',
      version: '1.0.0',
      description: 'Full-featured task management API with real-time updates, AI assistance, file uploads, and team collaboration.',
      contact: {
        name: 'TaskFlow Support',
        email: 'support@taskflow.app',
      },
    },
    servers: [
      { url: 'http://localhost:5000', description: 'Development server' },
      { url: 'http://localhost:5000', description: 'Production server' },
    ],
    components: {
      securitySchemes: {
        bearerAuth: {
          type: 'http',
          scheme: 'bearer',
          bearerFormat: 'JWT',
          description: 'Enter your JWT token here',
        },
      },
      schemas: {
        Task: {
          type: 'object',
          properties: {
            _id: { type: 'string' },
            title: { type: 'string', example: 'Complete project report' },
            description: { type: 'string', example: 'Finish the quarterly report with all charts' },
            status: { type: 'string', enum: ['backlog', 'pending', 'in-progress', 'completed', 'blocked', 'review', 'cancelled'] },
            priority: { type: 'string', enum: ['critical', 'high', 'medium', 'low', 'none'] },
            dueDate: { type: 'string', format: 'date-time' },
            category: { type: 'string' },
            tags: { type: 'array', items: { type: 'string' } },
            isFavorite: { type: 'boolean' },
            isRecurring: { type: 'boolean' },
            estimatedTime: { type: 'number' },
            timeSpent: { type: 'number' },
            subtasks: { type: 'array', items: { $ref: '#/components/schemas/Subtask' } },
          },
        },
        Subtask: {
          type: 'object',
          properties: {
            title: { type: 'string' },
            completed: { type: 'boolean' },
          },
        },
        User: {
          type: 'object',
          properties: {
            _id: { type: 'string' },
            name: { type: 'string' },
            username: { type: 'string' },
            email: { type: 'string', format: 'email' },
            bio: { type: 'string' },
            streak: { type: 'number' },
            focusTimeToday: { type: 'number' },
            preferences: {
              type: 'object',
              properties: {
                theme: { type: 'string', enum: ['light', 'dark', 'system'] },
                notifications: { type: 'boolean' },
                emailNotifications: { type: 'boolean' },
              },
            },
          },
        },
        Error: {
          type: 'object',
          properties: {
            message: { type: 'string' },
          },
        },
      },
    },
    paths: {
      '/api/auth/register': {
        post: {
          tags: ['Auth'],
          summary: 'Register a new user',
          requestBody: {
            required: true,
            content: {
              'application/json': {
                schema: {
                  type: 'object',
                  required: ['name', 'username', 'email', 'password'],
                  properties: {
                    name: { type: 'string' },
                    username: { type: 'string', minLength: 3, maxLength: 30, pattern: '^[a-zA-Z0-9_]+$' },
                    email: { type: 'string', format: 'email' },
                    password: { type: 'string', minLength: 8 },
                  },
                },
              },
            },
          },
          responses: {
            201: { description: 'User created successfully' },
            400: { description: 'Validation error' },
          },
        },
      },
      '/api/auth/login': {
        post: {
          tags: ['Auth'],
          summary: 'Login with email/username and password',
          requestBody: {
            required: true,
            content: {
              'application/json': {
                schema: {
                  type: 'object',
                  required: ['identifier', 'password'],
                  properties: {
                    identifier: { type: 'string' },
                    password: { type: 'string' },
                  },
                },
              },
            },
          },
          responses: {
            200: { description: 'Login successful' },
            401: { description: 'Invalid credentials' },
          },
        },
      },
      '/api/auth/check-username': {
        post: {
          tags: ['Auth'],
          summary: 'Check if a username is available',
          requestBody: {
            required: true,
            content: {
              'application/json': {
                schema: {
                  type: 'object',
                  required: ['username'],
                  properties: {
                    username: { type: 'string', minLength: 3, maxLength: 30 },
                  },
                },
              },
            },
          },
          responses: {
            200: { description: 'Username availability result' },
          },
        },
      },
      '/api/auth/forgot-password': {
        post: {
          tags: ['Auth'],
          summary: 'Request password reset email',
          requestBody: {
            required: true,
            content: {
              'application/json': {
                schema: {
                  type: 'object',
                  required: ['email'],
                  properties: { email: { type: 'string', format: 'email' } },
                },
              },
            },
          },
          responses: { 200: { description: 'Reset email sent if account exists' } },
        },
      },
      '/api/auth/reset-password': {
        post: {
          tags: ['Auth'],
          summary: 'Reset password with token',
          requestBody: {
            required: true,
            content: {
              'application/json': {
                schema: {
                  type: 'object',
                  required: ['token', 'password'],
                  properties: {
                    token: { type: 'string' },
                    password: { type: 'string', minLength: 6 },
                  },
                },
              },
            },
          },
          responses: { 200: { description: 'Password reset successful' } },
        },
      },
      '/api/tasks': {
        get: {
          tags: ['Tasks'],
          summary: 'Get all tasks with filters',
          security: [{ bearerAuth: [] }],
          parameters: [
            { name: 'status', in: 'query', schema: { type: 'string' } },
            { name: 'priority', in: 'query', schema: { type: 'string' } },
            { name: 'category', in: 'query', schema: { type: 'string' } },
            { name: 'search', in: 'query', schema: { type: 'string' } },
            { name: 'sort', in: 'query', schema: { type: 'string' } },
            { name: 'isFavorite', in: 'query', schema: { type: 'string' } },
          ],
          responses: { 200: { description: 'List of tasks' } },
        },
        post: {
          tags: ['Tasks'],
          summary: 'Create a new task',
          security: [{ bearerAuth: [] }],
          requestBody: {
            required: true,
            content: { 'application/json': { schema: { $ref: '#/components/schemas/Task' } } },
          },
          responses: { 201: { description: 'Task created' } },
        },
      },
      '/api/tasks/stats': {
        get: {
          tags: ['Tasks'],
          summary: 'Get task statistics',
          security: [{ bearerAuth: [] }],
          responses: { 200: { description: 'Task statistics' } },
        },
      },
      '/api/tasks/export': {
        get: {
          tags: ['Tasks'],
          summary: 'Export tasks as CSV or JSON',
          security: [{ bearerAuth: [] }],
          parameters: [
            { name: 'format', in: 'query', schema: { type: 'string', enum: ['json', 'csv'] } },
          ],
          responses: { 200: { description: 'Exported file' } },
        },
      },
      '/api/tasks/activity': {
        get: {
          tags: ['Tasks'],
          summary: 'Get activity log',
          security: [{ bearerAuth: [] }],
          responses: { 200: { description: 'Activity log entries' } },
        },
      },
      '/api/tasks/notifications': {
        get: {
          tags: ['Tasks'],
          summary: 'Get notifications',
          security: [{ bearerAuth: [] }],
          responses: { 200: { description: 'Notifications list' } },
        },
      },
      '/api/ai/chat': {
        post: {
          tags: ['AI'],
          summary: 'Chat with AI assistant about tasks',
          security: [{ bearerAuth: [] }],
          requestBody: {
            required: true,
            content: {
              'application/json': {
                schema: {
                  type: 'object',
                  properties: { message: { type: 'string' } },
                },
              },
            },
          },
          responses: { 200: { description: 'AI response' } },
        },
      },
    },
  },
  apis: [],
};

module.exports = swaggerJsdoc(options);
