# REST in Pieces: Fully Capable REST Service for Testing Client-Side Components

### Introduction

This is the REST in Pieces Full Stack REST service, based on the Atigeo BeanStack Full Stack JavaScript framework. 
This REST service is used to provide your full-stack client-side applications with a quick and powerful REST service
that can feed you random but consistent data.

### What does the BEAN stand for? 

BEAN (Bootstrap, Express, AngularJS, Node.js)

### Usage

#### Names Service

Basic Use

```
http://localhost:8080/names - Returns a random set of names with the following data:
```

Setting the Offset (default 0) and Limit (default 10)

```
http://localhost:8080/names?offset=5&limit=5
```

Capping out the maximum number of records the service can provide, useful for providing end-of-data scenarios.

```
http://localhost:8080/names?max=25&offset=20limit=10
```

Turning off the Metadata object to get only pure data

```
http://localhost:8080/names?metadata=1
http://localhost:8080/names?metadata=false
```

Changing the name of the output results array

```
http://localhost:8080/names?resultsName=rows
```

### Front-End Package Management and Automation 

We have adopted two powerful tools for package management and automation (there are several key ones out there):

- **Grunt** - powerful server-side JavaScript task runner, simplifying tasks that require automation and repetition. An essential tool that should be used by every development team. What does this mean and how does it save you time? Your JavaScript code is linted, libraries are compressed, obfuscated and concatenated. The CSS in SASS files are compiled into working CSS files. These CSS files are also compressed and concatenated. Grunt saves you a lot of time and can help with your deployment processes.
- **Bower** - powerful front-end JavaScript package manager. Works perfectly with Grunt when maintaining client-side applications. There is no need to manually grab updates for JavaScript libraries when they are updated. Bower handles this for you. With the help of Grunt, these files are automatically moved into your web application where they can
be used immediately for web development.

The **gruntfile.js** and **bower.json** files used by Grunt and Bower are pre-configured for out-of-the-box development. 

### Databases

No databases are used for this REST service, and instead all data is stored in memory.

### Developer Install Script:

sudo npm install -g grunt-cli; sudo npm install -g bower; npm install;

### Installation instructions:

When performing a clean install, npm looks at the package.json folder.

> npm install

Make sure there is no "node_modules" folder. The "install" command creates that folder and 
downloads all necessary dependencies and devDependencies listed in package.json. It is best to do everything from 
scratch for all new projects.

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
