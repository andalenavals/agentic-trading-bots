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
4. ``GITHUB_PAGES=true npm run build`` (this runs preprocessing first)
5. ``sphinx-build -b html docs out/docs``
6. upload ``out`` with ``actions/upload-pages-artifact``
7. deploy with ``actions/deploy-pages``

Local Build
-----------

Build the demo:

.. code-block:: bash

   npm run preprocess
   npm run build

Build the GitHub Pages version:

.. code-block:: bash

   GITHUB_PAGES=true npm run build

Build the Sphinx docs:

.. code-block:: bash

   python -m pip install -r docs/requirements.txt
   sphinx-build -b html docs out/docs
