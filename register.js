const commands = [
  {
    name: "request",
    description: "Request to borrow an item",
    options: [
      {
        name: "item",
        description: "Item you want",
        type: 3,
        required: true
      }
    ]
  },

  { name: "given", description: "Mark request/return as completed" },
  { name: "borrowers", description: "List all current borrowers" },
  { name: "return", description: "Start return process" },
  { name: "cancel", description: "Cancel current session" },

  {
    name: "reminder",
    description: "Check remaining time",
    options: [
      {
        name: "user",
        description: "Target user",
        type: 6,
        required: true
      }
    ]
  },

  {
    name: "ban-user",
    description: "Ban a user",
    options: [
      {
        name: "user",
        description: "User to ban",
        type: 6,
        required: true
      }
    ]
  },

  {
    name: "search",
    description: "Check borrowed item",
    options: [
      {
        name: "user",
        description: "Target user",
        type: 6,
        required: true
      }
    ]
  },

  {
    name: "timeout",
    description: "Timeout a user",
    options: [
      {
        name: "user",
        description: "User to timeout",
        type: 6,
        required: true
      },
      {
        name: "minutes",
        description: "Duration in minutes",
        type: 4,
        required: true
      }
    ]
  },

  {
    name: "trusted",
    description: "Mark user trusted",
    options: [
      {
        name: "user",
        description: "Target user",
        type: 6,
        required: true
      }
    ]
  },

  { name: "questions", description: "Get help" },

  {
    name: "accept",
    description: "Accept manually",
    options: [
      {
        name: "user",
        description: "User",
        type: 6,
        required: true
      },
      {
        name: "item",
        description: "Item",
        type: 3,
        required: true
      }
    ]
  },

  {
    name: "decline",
    description: "Decline manually",
    options: [
      {
        name: "user",
        description: "User",
        type: 6,
        required: true
      }
    ]
  }
];
