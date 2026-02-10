/**
 * Created by Zaccary on 24/10/2015.
 */


import UserModel from './user.model.js';
export function getUserByEmail(email, cb) {
  const promise = UserModel.findOne({ 'auth.email': email }).exec();
  if (!cb) return promise;
  promise.then(result => cb(null, result), err => cb(err));
};

export function getUsersByEmail(email, cb) {
  const promise = UserModel.find({ 'auth.email': email }).exec();
  if (!cb) return promise;
  promise.then(result => cb(null, result), err => cb(err));
};

export function getUserByName(username, cb) {
  const promise = UserModel.findOne({ username }).exec();
  if (!cb) return promise;
  promise.then(result => cb(null, result), err => cb(err));
};

export function getUserById(id, opts, cb) {
  if (!cb) {
    cb = opts;
  }

  const promise = UserModel.findOne({ _id: id })
    .lean(!!opts.lean)
    .exec();

  if (!cb) return promise;
  promise.then(result => cb(null, result), err => cb(err));
};

export function getUserCount(cb) {
  const promise = UserModel.countDocuments().exec();
  if (!cb) return promise;
  promise.then(result => cb(null, result), err => cb(err));
};

export function getAllUsersNoPaginate(cb) {
  const promise = UserModel.find()
    .sort({ 'attrs.join_date': -1 })
    .lean()
    .exec();
  if (!cb) return promise;
  promise.then(result => cb(null, result), err => cb(err));
};

export function getAllUsers(start, end, cb) {
  const promise = UserModel.find()
    .skip(start)
    .limit(end)
    .sort({ 'attrs.join_date': -1 })
    .lean()
    .exec();
  if (!cb) return promise;
  promise.then(result => cb(null, result), err => cb(err));
};

export function removeUser(userId, cb) {
  const promise = UserModel.deleteOne({ _id: userId }).exec();
  if (!cb) return promise;
  promise.then(result => cb(null, result), err => cb(err));
};

export function getSiteMods() {
  return UserModel
    .find({ 'attrs.userLevel': { $gte: 20 } })
    .exec();
};

export default { getUserByEmail, getUsersByEmail, getUserByName, getUserById, getUserCount, getAllUsersNoPaginate, getAllUsers, removeUser, getSiteMods };
