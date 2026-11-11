import { test } from 'node:test'
import assert from 'node:assert/strict'
import { friendly } from './errors.js'

test('rewords raw errors, keeps a lead-in, passes friendly text through', () => {
  assert.equal(friendly('new row violates row-level security policy for table "messages"'), "You don't have permission to do that.")
  assert.equal(friendly('Message failed: TypeError: Failed to fetch'), "Message failed: Couldn't reach Chitchat. Check your connection.")
  assert.equal(friendly('message not found'), "That isn't there any more.")
  assert.equal(friendly('not allowed to pin here'), "You don't have permission to do that.")
  assert.equal(friendly('That username is taken.'), 'That username is taken.')
  assert.equal(friendly('Slowmode is on here. You can send again in 5s.'), 'Slowmode is on here. You can send again in 5s.')
})
