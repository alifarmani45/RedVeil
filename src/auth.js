const bcrypt = require('bcryptjs');
const { getSetting, setSetting } = require('./db');

function verifyLogin(username, password) {
  const storedUser = getSetting('admin_user');
  const storedHash = getSetting('admin_pass_hash');
  if (username !== storedUser) return false;
  return bcrypt.compareSync(password, storedHash);
}

function changePassword(newPassword) {
  setSetting('admin_pass_hash', bcrypt.hashSync(newPassword, 10));
}

function requireAuth(req, res, next) {
  if (req.session && req.session.isAdmin) return next();
  if (req.path.startsWith('/api/')) return res.status(401).json({ error: 'unauthorized' });
  return res.redirect('/login.html');
}

module.exports = { verifyLogin, changePassword, requireAuth };
