const jwt = require('jsonwebtoken')

const signToken = (user) => {
  return jwt.sign({ sub: user.id, email: user.email }, process.env.JWT_SECRET, {
    expiresIn: '7d',
  })
}

const verifyToken = (token) => {
  try {
    return jwt.verify(token, process.env.JWT_SECRET)
  } catch {
    return null
  }
}

module.exports = { signToken, verifyToken }
