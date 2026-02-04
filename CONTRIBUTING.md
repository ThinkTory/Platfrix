# Contributing Guide

Thank you for your interest in contributing! 🎉  
This document outlines the rules, workflow, and standards we follow to keep the codebase clean, consistent, and maintainable.

Please read this carefully before creating a branch or opening a Pull Request.

---

## 📋 Table of Contents

- Code of Conduct
- Getting Started
- Branching Strategy
- Branch Naming Convention
- Commit Message Convention
- Pull Request Guidelines
- Code Style & Quality
- Reviews & Approvals
- Reporting Bugs
- Suggesting Features

---

## 🤝 Code of Conduct

By participating in this project, you agree to:
- Be respectful and professional
- Welcome constructive feedback
- Avoid offensive or inappropriate behavior

Harassment, discrimination, or toxic behavior will not be tolerated.

---

## 🚀 Getting Started

1. Fork the repository (if you are an external contributor)
2. Clone your fork or the dev repository
3. Create a new branch **from `dev`**
4. Make your changes
5. Commit following the rules below
6. Push your branch
7. Open a Pull Request (PR)

---

## 🌿 Branching Strategy

- `main` is **always stable and deployable**
- Direct commits to `main` and `dev` are **not allowed**
- All changes must go through a Pull Request

---

## 🏷️ Branch Naming Convention

All branches **must** follow this format:

```text
<type>/<short-description>
````

### Allowed branch types

| Type        | Purpose                 |
| ----------- | ----------------------- |
| `feature/`  | New functionality       |
| `bugfix/`   | Bug fixes               |
| `hotfix/`   | Urgent production fixes |
| `refactor/` | Code restructuring      |
| `docs/`     | Documentation           |
| `test/`     | Tests only              |

### Examples

```text
feature/add-user-login
bugfix/fix-navbar-crash
refactor/auth-service
docs/update-api-readme
```

❌ Invalid branch names:

```text
loginFix
new_feature
bug123
```

---

## ✍️ Commit Message Convention

We use **Conventional Commits**.

### Commit format

```text
<type>(optional-scope): <short description>
```

### Allowed commit types

| Type       | Purpose                              |
| ---------- | ------------------------------------ |
| `feat`     | New feature                          |
| `fix`      | Bug fix                              |
| `docs`     | Documentation                        |
| `style`    | Formatting (no logic change)         |
| `refactor` | Code changes without behavior change |
| `test`     | Adding or fixing tests               |
| `chore`    | Tooling, configs, dependencies       |

### Examples

```text
feat: add user login endpoint
fix(auth): handle expired token
docs: update authentication section
refactor: simplify user validation logic
test: add unit tests for auth service
chore: update dependencies
```

❌ Avoid:

```text
update
fix stuff
wip
changes
```

---

## 🔀 Pull Request Guidelines

Every PR must:

* Be linked to an issue (if applicable)
* Contain a clear title and description
* Pass all automated checks
* Follow branch & commit rules
* Be reviewed before merging

### PR Title Example

```text
feat: add user login flow
```

### PR Description Should Include

* What was changed
* Why it was changed
* How to test the change

---

## 🧹 Code Style & Quality

* Follow existing project conventions
* Keep functions small and readable
* Avoid unnecessary complexity
* Remove unused code and logs
* Add or update tests when needed

If linting or formatting tools are configured, **they must pass**.

---

## 👀 Reviews & Approvals

* At least **one approval** is required
* Address all review comments
* Do not merge your own PR unless explicitly allowed
* Squash or rebase commits if requested

---

## 🐛 Reporting Bugs

When reporting a bug, please include:

* Clear description of the issue
* Steps to reproduce
* Expected vs actual behavior
* Screenshots or logs (if applicable)

---

## 💡 Suggesting Features

Feature requests are welcome!
Please include:

* The problem you are trying to solve
* Your proposed solution
* Any alternatives considered

---

## ✅ Final Notes

These rules exist to:

* Keep the history clean
* Make reviews easier
* Reduce bugs
* Help everyone move faster 🚀

If you are unsure about anything, ask before proceeding.

Happy contributing! ❤️
