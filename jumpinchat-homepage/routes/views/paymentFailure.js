export default async function paymentFailure(req, res) {
  const { locals } = res;
  locals.user = req.user;
  locals.section = 'Payment failure';

  const { reason } = req.query;
  locals.reason = reason;

  return res.render('paymentFailure');
}
