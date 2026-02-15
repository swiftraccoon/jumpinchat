export default async function privacy(req, res) {
  const { locals } = res;

  // locals.section is used to set the currently selected
  // item in the header navigation.
  locals.section = 'Privacy Policy';
  locals.user = req.user;

  // Render the view
  return res.render('privacy');
}
