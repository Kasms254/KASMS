# Color Standards Guide

This document defines the standardized color palette for the School Management System frontend.

## Button Colors

### Primary Actions
- **Base**: `bg-indigo-600 text-white`
- **Hover**: `hover:bg-indigo-700`
- **Focus**: `focus:outline-none focus:ring-2 focus:ring-indigo-200`
- **Disabled**: `disabled:opacity-60 disabled:cursor-not-allowed`
- **Full class**: `bg-indigo-600 text-white hover:bg-indigo-700 disabled:opacity-60 disabled:cursor-not-allowed transition`

**Usage**: Submit forms, primary CTAs, main actions (Edit, Save, Create, etc.)

### Success/Creation Actions
- **Base**: `bg-green-600 text-white`
- **Hover**: `hover:bg-green-700`
- **Full class**: `bg-green-600 text-white hover:bg-green-700 transition`

**Usage**: Download CSV, Generate, Add new items, Success confirmations

### Destructive/Danger Actions
- **Base**: `bg-red-600 text-white`
- **Hover**: `hover:bg-red-700`
- **Disabled**: `disabled:opacity-60 disabled:cursor-not-allowed`
- **Full class**: `bg-red-600 text-white hover:bg-red-700 disabled:opacity-60 disabled:cursor-not-allowed transition`

**Usage**: Delete, Remove, Permanent actions

### Secondary/Cancel Actions
- **Base**: `bg-gray-200 text-gray-700`
- **Hover**: `hover:bg-gray-300`
- **Full class**: `bg-gray-200 text-gray-700 hover:bg-gray-300 transition`

**Usage**: Cancel, Close, Secondary actions that don't modify data

## Status Badges

### Active/Success Status
- **Classes**: `bg-green-100 text-green-700`
- **Usage**: Active users, completed items, success indicators

### Inactive/Error Status
- **Classes**: `bg-red-100 text-red-700`
- **Usage**: Inactive users, errors, warnings

### Info Status
- **Classes**: `bg-indigo-50 text-indigo-600`
- **Usage**: Count badges, informational indicators

## Form Elements

### Input Fields
- **Base**: `border border-neutral-200 rounded px-3 py-2 text-black`
- **Focus**: `focus:outline-none focus:ring-2 focus:ring-indigo-200`
- **Error**: `border-rose-500`
- **Disabled**: `disabled:bg-gray-100 disabled:cursor-not-allowed`

### Error Messages
- **Text**: `text-rose-600 text-xs`
- **Background**: `bg-rose-50 border border-rose-100`

## Icons and Decorative Elements

### Avatar/Icon Backgrounds
- **Primary**: `bg-indigo-100 text-indigo-700`
- **Success**: `bg-green-100 text-green-600`
- **Danger**: `bg-red-100 text-red-600`

### Gradients
- **User avatar**: `from-indigo-500 to-pink-500`
- **Empty state icon**: `from-indigo-100 to-purple-100`

## Notifications/Toasts

### Success Toast
- **Background**: `bg-green-600 text-white`
- **Icon**: CheckCircle2

### Error Toast
- **Background**: `bg-rose-600 text-white`
- **Icon**: AlertCircle

## Modals

### Close Button (X icon)
- **Classes**: `text-neutral-400 hover:text-neutral-600 hover:bg-neutral-100 transition`
- **DO NOT USE**: `text-red-700` (inconsistent with design)

### Modal Backdrop
- **Classes**: `bg-black/50`

### Modal Animations
- **Backdrop**: `animate-in fade-in duration-200`
- **Content**: `animate-in zoom-in-95 duration-200`

## Calendar Colors

### Selected Date
- **Background**: `bg-indigo-500 text-white`

### Weekend Days
- **Background**: `bg-rose-500`
- **Text**: `text-rose-600`

## Anti-Patterns (DO NOT USE)

❌ `bg-red-600` for cancel buttons (use `bg-gray-200` instead)
❌ `text-red-700` for modal close icons (use `text-neutral-400` instead)
❌ `bg-blue-600` for standard actions (use `bg-indigo-600` instead)
❌ Mixed button colors in the same context (e.g., green for "Add Class" and blue for "Add Subject")

## Migration Checklist

When updating a component:
- [ ] Replace all cancel buttons with gray (`bg-gray-200`)
- [ ] Replace all close icons with neutral (`text-neutral-400`)
- [ ] Ensure primary actions use indigo-600
- [ ] Ensure destructive actions use red-600
- [ ] Ensure success actions use green-600
- [ ] Add hover states to all buttons
- [ ] Add disabled states where applicable
- [ ] Add transition classes for smooth animations
