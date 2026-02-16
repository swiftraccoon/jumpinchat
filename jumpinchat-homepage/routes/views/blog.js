import { marked } from 'marked';
import posts from '../../data/blog-posts.js';

export default async function blog(req, res) {
  const { locals } = res;

  locals.user = req.user;

  const { slug } = req.params;

  if (slug) {
    const post = posts.find((p) => p.slug === slug);

    if (!post) {
      return res.status(404).render('errors/error', {
        code: 404,
        message: 'page could not be found, sorry',
      });
    }

    locals.section = post.title;
    locals.description = post.summary;
    locals.post = {
      ...post,
      content: marked(post.content),
    };

    return res.render('blogPost');
  }

  const sortedPosts = [...posts].sort(
    (a, b) => new Date(b.date) - new Date(a.date),
  );

  locals.section = 'Blog';
  locals.description = 'News and updates from JumpInChat.';
  locals.posts = sortedPosts;

  return res.render('blog');
}
