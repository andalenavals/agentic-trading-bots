Deployment
==========

GitHub Pages
------------

The repository deploys two static pages to GitHub Pages:

* demo: ``https://andalenavals.github.io/agentic-trading-bots/``
* docs: ``https://andalenavals.github.io/agentic-trading-bots/docs/``

The GitHub Actions workflow builds both pieces into one artifact:

1. ``npm ci``
2. ``npm run typecheck``
3. ``npm run lint``
4. ``npm run test:py``
5. ``GITHUB_PAGES=true npm run build`` (this runs preprocessing first)
6. ``sphinx-build -b html docs out/docs``
7. upload ``out`` with ``actions/upload-pages-artifact``
8. deploy with ``actions/deploy-pages``

Local Build
-----------

Build the demo. The build command runs preprocessing first:

.. code-block:: bash

   npm run build

Build the GitHub Pages version:

.. code-block:: bash

   GITHUB_PAGES=true npm run build

Build the Sphinx docs:

.. code-block:: bash

   npm run docs:install
   npm run docs:build
