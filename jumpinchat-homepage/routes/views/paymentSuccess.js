export default async function paymentSuccess(req, res) {
  const { locals } = res;
  locals.user = req.user;
  locals.section = 'Payment success';

  const { productId, value } = req.query;
  locals.product = {
    id: productId,
    value,
  };

  return res.render('paymentSuccess');
}
