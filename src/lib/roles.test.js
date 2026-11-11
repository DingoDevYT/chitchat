import test from 'node:test'
import assert from 'node:assert/strict'
import { sortRoles, topColor, hasPerm, rank, canSetRole, canKick, groupMembers } from './roles.js'

const roles = sortRoles([
  { id: 'low', position: 1, color: null, permissions: ['pin_messages'], hoist: false, created_at: '1' },
  { id: 'mod', position: 10, color: '#ff0000', permissions: ['manage_roles', 'kick_members'], hoist: true, created_at: '2' },
  { id: 'vip', position: 5, color: '#00ff00', permissions: [], hoist: true, created_at: '3' },
])
const data = { roles, byUser: { a: ['low', 'mod'], b: ['low'], c: ['vip', 'low'] } }

test('sort and colour', () => {
  assert.deepEqual(roles.map(r => r.id), ['mod', 'vip', 'low'])
  assert.equal(topColor(data, 'a'), '#ff0000')
  assert.equal(topColor(data, 'b'), undefined)
  assert.equal(topColor(undefined, 'a'), undefined)
})

test('permissions and hierarchy', () => {
  assert.equal(hasPerm(data, 'member', 'a', 'kick_members'), true)
  assert.equal(hasPerm(data, 'member', 'b', 'kick_members'), false)
  assert.equal(hasPerm(data, 'admin', 'z', 'manage_server'), true)
  assert.equal(rank(data, 'owner', 'z'), Infinity)
  assert.equal(rank(data, 'member', 'b'), 1)
  assert.equal(rank(data, 'admin', 'z'), -Infinity)
  assert.equal(canSetRole(data, 'member', 'a', roles[1]), true) // vip below mod
  assert.equal(canSetRole(data, 'member', 'a', roles[0]), false) // own top role
  assert.equal(canSetRole(data, 'member', 'a', { position: 0, permissions: ['manage_server'] }), false) // perm a lacks
  assert.equal(canSetRole(data, 'admin', 'z', roles[2]), false) // legacy admin without roles: nothing below
  assert.equal(canSetRole(data, 'owner', 'z', roles[0]), true)
})

test('kick follows the "leave or kick" policy', () => {
  assert.equal(canKick(data, 'member', 'a', 'b', 'member'), true) // mod kicks lower member
  assert.equal(canKick(data, 'member', 'a', 'a2', 'admin'), false) // role kickers never kick admins
  assert.equal(canKick({ roles, byUser: { a: ['mod'], e: ['mod'] } }, 'member', 'a', 'e', 'member'), false) // equal rank
  assert.equal(canKick(data, 'member', 'b', 'c', 'member'), false) // no kick perm
  assert.equal(canKick(data, 'admin', 'z', 'a', 'member'), true) // admins kick any plain member
  assert.equal(canKick(data, 'admin', 'z', 'y', 'admin'), false)
  assert.equal(canKick(data, 'owner', 'z', 'y', 'admin'), true)
  assert.equal(canKick(data, 'owner', 'z', 'z', 'owner'), false)
  assert.equal(canKick(data, 'member', 'a', 'b', undefined), false) // not a member (yet)
})

test('member groups', () => {
  const members = ['a', 'b', 'c', 'd'].map(user_id => ({ user_id }))
  const g = groupMembers(members, data, id => id !== 'd')
  assert.deepEqual(g.map(s => [s.key, s.list.map(m => m.user_id)]), [['mod', ['a']], ['vip', ['c']], ['online', ['b']], ['offline', ['d']]])
})
