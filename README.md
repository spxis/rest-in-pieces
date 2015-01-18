# Atigeo BeanStack Full Stack JavaScript project

### Introduction

This is the Atigeo BeanStack Full Stack JavaScript framework. This bootstrapped project contains everything you need to 
easily and quickly write a responsive web application using JavaScript as the primary language.  We've embraced many of
best practices and industry standards used at Atigeo and allow you to focus on building great apps
without having to worry about spending countless hours on the underlying framework.

### What does the BEAN stand for? 

BEAN (Bootstrap, Express, AngularJS, Node.js)

### What technologies are used?

Nearly every component of the Atigeo BeanStack uses Open Source web components. These are the primary web software development technologies used on a daily basis.

- **Node.js** - Powerful JavaScript platform for building fast, scalable network applications. It runs on many platforms and allows you do write JavaScript on the server! The bundled command-line *npm* package manager makes extending your server-side application effortless.
- **Express** - Minimalistic and robust NodeJS web application framework for building web applications. This makes using Node as a web server or building a REST service very easy.
- **AngularJS** - Industry leading front-end JavaScript environment for rapid application development. You can focus on accessing and displaying data quite easily with Angular, with its "bidirectional data binding" that makes it extremely powerful and useful. There are also many developer extensions that can be added to your Angular application, allow you to add new functionality quickly.
- **Bootstrap** - Twitter Bootstrap is a responsive framework that allows for quick & easy HTML desktop and mobile development. It encourages consistency between applications through its templates and grid system. We use the official SASS-powered version of Bootstrap, rather than the default version (which uses the LESS CSS framework). The Bootstrap framework is an excellent starter framework for rapidly building a working website that stylistically requires minimal effort. 
- **SASS** - Object-oriented CSS framework that extends CSS/CSS3, giving you access to powerful features such as animations and transitions. We choose to use the SCSS syntax/variation of SASS (rather than the "indented" original version of SASS). Since SASS is just an extension of CSS, you don't need to know anything special to get started.
- **jQuery** - Industry leading JavaScript library that has enabled millions of developers to write simple JavaScript applications. AngularJS uses a "lite" version of jQuery and it is very easy to use for beginners, yet powerful enough for advanced usage. 
- **MooTools** - Powerful Object-oriented JavaScript library to enhancing and extending JavaScript websites. A lot of Atigeo's legacy applications use MooTools as it's primary JavaScript framework and MooTools can still be used if necessary.

The Atigeo BeanStack embraces other web frameworks and components that extend your web applications as well. While optional, they are incredibly useful in your every day work:

- **Handlebars** - Powerful semantic HTML templating on the server-side. Allows you to use templates for repetitive server-side (or client-side) tasks. This could be swapped out for Jade or EJS if desired or needed.
- **Font Awesome** - Useful collection of scalable vector icons for web applications, using entirely HTML and CSS. Works well with both Bootstrap and SASS. A lot of time is saved using Font Awesome as you can usually find an appropriate icon that will work with your application.
- **Moment** - JavaScript library for date parsing, manipulation, validation and displaying (usable in both front and back end JavaScript code).
- **Underscore** - JavaScript library with numerous useful utility functions, without extending built-in objects. Underscore can make working with JavaScript objects and arrays easier than the native implementations that JavaScript originally provides you with. 
- **Mocha** - feature-rich JavaScript framework for server and browser testing.
- **Winston** - popular configurable Node.js logging framework. Winston is configured to write messages to both the console and filesystem for debugging purposes.

### Front-End Package Management and Automation 

We have adopted two powerful tools for package management and automation (there are several key ones out there):

- **Grunt** - powerful server-side JavaScript task runner, simplifying tasks that require automation and repetition. An essential tool that should be used by every development team. What does this mean and how does it save you time? Your JavaScript code is linted, libraries are compressed, obfuscated and concatenated. The CSS in SASS files are compiled into working CSS files. These CSS files are also compressed and concatenated. Grunt saves you a lot of time and can help with your deployment processes.
- **Bower** - powerful front-end JavaScript package manager. Works perfectly with Grunt when maintaining client-side applications. There is no need to manually grab updates for JavaScript libraries when they are updated. Bower handles this for you. With the help of Grunt, these files are automatically moved into your web application where they can
be used immediately for web development.

The **gruntfile.js** and **bower.json** files used by Grunt and Bower are pre-configured for out-of-the-box development. 

### Databases

Currently, the databases that can currently be used out of the box include:

- **MongoDB w/ Mongoose** - MongoDB is the industry leading NoSQL database, with Mongoose being the interface used to 
acccess Mongo data.

Future versions of the BeanStack would include code for connecting to MySQL and PostgreSQL databases.

### Working Environment Pre-Requisites

- The best IDEs for JavaScript full-stack development are WebStorm and Sublime Text.

### Source Control Environment

The Atigeo BeanStack uses and recommends using Git, if you're not already.

- **Git** - This is the industry leading open-source distributed version control system for software development. 
Be familiar with concepts such as cloning, branching and merging.

Our .gitignore file is pre-configured for daily web application development. Read through it and make sure it's not 
ignoring a file you want commited to your repository. Also, add to it if there are files or directories you do not
want stored in your repository.

### Database Pre-requisites 

- If using the MongoDB/Mongoose components, you will need to have access to a local or remote MongoDB server instance.
- Developers can get a free 500MB fully-managed Sandbox environment at MongoLab (https://mongolab.com/). 
This is a Mongo-DB-as-a-Service provider.

### Developer Install Script:

sudo npm install -g grunt-cli; sudo npm install -g bower;

### Pre-Installation instructions:

- GruntJS: Make sure it is installed globally.

> grunt -v # Should get the installed version number. If not, install it.
> npm install -g grunt-cli

- Bower: Make sure it is installed globally.

> bower -v # Should get the installed version number. If not, install it.
> npm install -g bower

### Installation instructions:

When performing a clean install, npm looks at the package.json folder.

> npm install

Make sure there is no "node_modules" folder. The "install" command creates that folder and 
downloads all necessary dependencies and devDependencies listed in package.json. It is best to do everything from 
scratch for all new projects.

#### Windows installations:

Note to Windows users: Windows requires several .NET dependencies that will need to be installed before the 
"install" command. 

- .NET Framework 2.0 SDK
- Microsoft Visual Studio 2005

#### Handling errors during install:

If you encounter errors, read through them to make sure your operating system has the correct dependencies to install 
the packages installed by npm. 
If all else fails, you can try running the install as sudo (an account with Administrator privileges). 
Also read the error messages to get an idea
what the issue is. Top issues when installing via npm:

- npm is not installed.
- permissions requiring a sudo.
- grunt (or grunt-cli) is not installed globally.
- bower is not installed globally.
- dependency in package.json has been renamed or deleted from repository.
- the node_modules folder was not empty (or pre-existed) when running "npm install" for the first time.

After npm installs all dependencies from the dependencies list in package.json, bower is run. When run for the first 
time, you will be prompted to allow/deny then sending back usage information. Enter Y/N. 

### Starting the application:

> npm start

Traditionally, an ExpressJS application can be started with the "node app.js" command. We use "npm start" to run the 
application. npm looks inside the package.json file for instructions on what configuration options to use for the 
'start' command in the "scripts" section.

If you see the "uncaughtException: listen EADDRINUSE" then you need to configure different ports in config/config.js.

### Pre-configured environments:

- Development: running on port 8080
- Staging: running on port 8080
- Production: running on port 80

### Release History
See the [CHANGELOG](CHANGELOG).
