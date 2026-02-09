/**
 * Created by Zaccary on 24/10/2015.
 */

const UserModel = require('./user.model');

module.exports.getUserByEmail = function getUserByEmail(email, cb) {
  const promise = UserModel.findOne({ 'auth.email': email }).exec();
  if (!cb) return promise;
  promise.then(result => cb(null, result), err => cb(err));
};

module.exports.getUsersByEmail = function getUserByEmail(email, cb) {
  const promise = UserModel.find({ 'auth.email': email }).exec();
  if (!cb) return promise;
  promise.then(result => cb(null, result), err => cb(err));
};

module.exports.getUserByName = function getUserByName(username, cb) {
  const promise = UserModel.findOne({ username }).exec();
  if (!cb) return promise;
  promise.then(result => cb(null, result), err => cb(err));
};

module.exports.getUserById = function getUserById(id, opts, cb) {
  if (!cb) {
    cb = opts;
  }

  const promise = UserModel.findOne({ _id: id })
    .lean(!!opts.lean)
    .exec();

  if (!cb) return promise;
  promise.then(result => cb(null, result), err => cb(err));
};

module.exports.getUserCount = function getAllUsers(cb) {
  const promise = UserModel.countDocuments().exec();
  if (!cb) return promise;
  promise.then(result => cb(null, result), err => cb(err));
};

module.exports.getAllUsersNoPaginate = function getAllUsersNoPaginate(cb) {
  const promise = UserModel.find()
    .sort({ 'attrs.join_date': -1 })
    .lean()
    .exec();
  if (!cb) return promise;
  promise.then(result => cb(null, result), err => cb(err));
};

module.exports.getAllUsers = function getAllUsers(start, end, cb) {
  const promise = UserModel.find()
    .skip(start)
    .limit(end)
    .sort({ 'attrs.join_date': -1 })
    .lean()
    .exec();
  if (!cb) return promise;
  promise.then(result => cb(null, result), err => cb(err));
};

module.exports.removeUser = function removeUser(userId, cb) {
  const promise = UserModel.deleteOne({ _id: userId }).exec();
  if (!cb) return promise;
  promise.then(result => cb(null, result), err => cb(err));
};

module.exports.getSiteMods = function getSiteMods() {
  return UserModel
    .find({ 'attrs.userLevel': { $gte: 20 } })
    .exec();
};
