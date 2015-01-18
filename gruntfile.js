module.exports = function (grunt) {
    // load all grunt tasks matching the `grunt-*` pattern
    require('load-grunt-tasks')(grunt);

    grunt.initConfig({
        pkg: grunt.file.readJSON('package.json'),

        meta: {
            basePath: './',
            jsTestPath: 'test/',
            jsSourcePath: 'public/src/js/',
            jsDistributionPath: 'public/dist/js/',
            cssSourceSassPath: 'public/src/scss/',
            cssSourcePath: 'public/src/css/',
            cssDistributionPath: 'public/dist/css/'
        },

        banner: '/*!\n' +
            ' * Atigeo BeanStack Full Stack JavaScript Framework V1\n' +
            ' * Version <%= pkg.version %> built <%= grunt.template.today("yyyy-mm-dd") %>\n' +
            ' * Copyright <%= grunt.template.today("yyyy") %> Atigeo LLC\n' +
            '*/\n',

        files: {
            vendorJsFiles: [
                '<%= meta.jsDistributionPath %>vendors/handlebars.js',
                '<%= meta.jsDistributionPath %>vendors/moment.js',
                '<%= meta.jsDistributionPath %>vendors/spin.js',
                '<%= meta.jsDistributionPath %>vendors/underscore.js',
                '<%= meta.jsDistributionPath %>vendors/underscore.string.min.js',
                '<%= meta.jsDistributionPath %>vendors/angular.js',
                '<%= meta.jsDistributionPath %>vendors/angular-bootbox.js',
                '<%= meta.jsDistributionPath %>vendors/angular-loading.js',
                '<%= meta.jsDistributionPath %>vendors/angular-local-storage.js',
                '<%= meta.jsDistributionPath %>vendors/angular-notifications-bar.js',
                '<%= meta.jsDistributionPath %>vendors/angular-ui-bootstrap.js',
                '<%= meta.jsDistributionPath %>vendors/angular-ui-bootstrap-tpls.js',
                '<%= meta.jsDistributionPath %>vendors/angular-ui-utils.js'
            ],
            vendorCssFiles: [
                '<%= meta.cssDistributionPath %>vendors/angular-loading.css',
                '<%= meta.cssDistributionPath %>vendors/angular-notifications-bar.css',
                '<%= meta.cssDistributionPath %>vendors/font-awesome.css'
            ],
            beanStackJsFiles: [
                '<%= meta.jsSourcePath %>xui-bootstrap.js',
                '<%= meta.jsSourcePath %>xUI.BeanStack.js'
            ],
            beanStackCssFiles: [
                '<%= meta.cssSourcePath %>xUI.Bootstrap.sass.css',
                '<%= meta.cssSourcePath %>xUI.BeanStack.sass.css'
            ],
            jsHintFiles: [
                'app.js',
                'gruntfile.js',
                'app/*.js',
                'bin/**',
                'config/*.js',
                'controllers/*.js',
                'db/*.js',
                'models/*.js',
                'routes/*.js',
                'views/*.js',
                '<%= meta.jsSourcePath %>/*.js'
            ]
        },

        clean: {
            options: {
                force: true
            },
            build: {
                src: [ 'lib' ],
                vendors: [
                    'public/dist/css/vendors',
                    'public/dist/js/vendors'
                ]
            },
            reset: {
                src: [
                    'lib',
                    'bower_components',
                    'node_modules'
                ]
            }
        },

        compass: {
            dev: {
                options: {
                    sassDir: 'public/src/scss',
                    cssDir: 'public/src/css'
                }
            }
        },

        uglify: {
            options: {
                compress: {
                    drop_console: true
                },
                mangle: {
                    except: ['$super', 'jQuery']
                },
                banner: '<%= banner %>'
            },
            compressVendorJs: {
                files: {
                    '<%= meta.jsDistributionPath %>vendor.min.js': [
                        '<%= meta.jsDistributionPath %>vendors/jquery.js',
                        '<%= meta.jsDistributionPath %>vendors/mootools-core.js',
                        '<%= meta.jsDistributionPath %>vendors/bootstrap.js'
                    ]
                }
            },
            compressBeanStackJs: {
                files: {
                    '<%= meta.jsDistributionPath %>beanstack.min.js': ['<%= files.beanStackJsFiles %>']
                }
            }
        },

        concat: {
            options: {
                stripBanners: true
            },

            concatVendorCss: {
                files: {
                    '<%= meta.cssDistributionPath %>vendor.css': ['<%= files.vendorCssFiles %>']
                }
            },

            concatBeanStackCss: {
                files: {
                    '<%= meta.cssDistributionPath %>beanstack.css': ['<%= files.beanStackCssFiles %>']
                }
            },

            concatVendorJs: {
                files: {
                    '<%= meta.jsDistributionPath %>vendor.js': [
                        '<%= meta.jsDistributionPath %>vendors/jquery.js',
                        '<%= meta.jsDistributionPath %>vendors/mootools-core.js',
                        '<%= meta.jsDistributionPath %>vendors/bootstrap.js'
                    ]
                }
            },
            concatBeanStackJs: {
                src: ['<%= files.beanStackJsFiles %>'],
                dest: '<%= meta.jsDistributionPath %>beanstack.js'
            }
        },

        cssmin: {
            options: {
                banner: '<%= banner %>',
                report: true
            },
            minifyVendorCss: {
                files: {
                    '<%= meta.cssDistributionPath %>vendor.min.css': ['<%= files.vendorCssFiles %>']
                }
            },
            minifyBeanStackCss: {
                files: {
                    '<%= meta.cssDistributionPath %>beanstack.min.css': ['<%= files.beanStackCssFiles %>']
                }
            }
        },

        jshint: {
            options: {
                curly: true,
                eqeqeq: true,
                eqnull: true,
                browser: true,
                quotmark: 'single',
                expr: true,
                '-W099': true,
                '-W053': true,
                '-W027': true,
                smarttabs: true,
                globals: {
                    jQuery: true,
                    MooTools: true
                },
                ignores: [
                    '<%= meta.jsSourcePath %>/*.min.js',
                    '<%= meta.jsSourcePath %>/*bootstrap*.js'
                ]
            },
            files: ['<%= files.jsHintFiles %>']
        },

        bower: {
            install: {
                options: {
                    verbose: true,
                    targetDir: './lib'
                }
            }
        },

//        shell: {
//
//        },

        bowercopy: {
            options: {
                srcPrefix: 'bower_components',
                clean: false
            },
            setup_fontawesome: {
                src: 'font-awesome/scss/*',
                dest: 'public/src/scss/font-awesome'
            },
            setup_sass: {
                src: 'bootstrap-sass-twbs/assets/stylesheets/bootstrap/*',
                dest: 'public/src/scss/bootstrap'
            },
            setup_bootstrap: {
                '//': 'Grab the vendor bootstrap files from the xui-bootstrap project.',
                options: {
                    destPrefix: 'public/dist'
                },
                files: {
                    'js/vendors': 'xui-bootstrap/dist/js/bootstrap*.js',
                    'css/vendors': 'xui-bootstrap/dist/css/bootstrap*.css'
                }
            },
            setup_xui_bootstrap: {
                '//': 'Grab the xui-bootstrap files from the xui-bootstrap project.',
                options: {
                    destPrefix: 'public/dist'
                },
                files: {
                    'css': 'xui-bootstrap/dist/css/xui-bootstrap*.css',
                    'fonts': 'xui-bootstrap/dist/fonts/*',
                    'images': 'xui-bootstrap/dist/images/*',
                    'js': 'xui-bootstrap/dist/js/xui-bootstrap*.js'
                }
            },
            deploy: {
                options: {
                    destPrefix: 'public/dist'
                },
                files: {
                    'js/vendors/angular.js': 'angular/angular.js',
                    'css/vendors/font-awesome.css': 'font-awesome/css/font-awesome.css',
                    'css/vendors/font-awesome.min.css': 'font-awesome/css/font-awesome.min.css',
                    'fonts': 'font-awesome/fonts/*',
                    'js/vendors/jquery.js': 'jquery/dist/jquery.js',
                    'js/vendors/jquery.min.js': 'jquery/dist/jquery.min.js',
                    'js/vendors/jquery.min.map': 'jquery/dist/jquery.min.map',
                    'js/vendors/mootools-core.js': 'mootools/dist/mootools-core.js',
                    'js/vendors/mootools-core.min.js': 'mootools/dist/mootools-core.min.js',
                    'js/vendors/mootools-core-compat.js': 'mootools/dist/mootools-core-compat.js',
                    'js/vendors/mootools-core-compat.min.js': 'mootools/dist/mootools-core-compat.min.js',
                    'js/vendors/mootools-core-server.js': 'mootools/dist/mootools-core-server.js',
                    'js/vendors/handlebars.js': 'handlebars/handlebars.js',
                    'js/vendors/handlebars.min.js': 'handlebars/handlebars.min.js',
                    'js/vendors/moment.js': 'moment/moment.js',
                    'js/vendors/underscore.js': 'underscore/underscore.js'
                }
            }
        },

        bump: {
            options: {
                files: ['package.json'],
                updateConfigs: [],
                tagName: 'v%VERSION%',
                tagMessage: 'Version %VERSION%',
                createTag: false,
                commit: false,
                push: false
            }
        },

        watch: {
            options: {
                livereload: false
            },
            jshint: {
                files: ['<%= jshint.files %>'],
                tasks: ['jshint']
            },
            bump: {
                files: [
                    'app/**',
                    'bin/**',
                    'config/**',
                    'controllers/**',
                    'db/**',
                    'models/**',
                    'public/*.html',
                    'routes/**',
                    'views/**',
                    'app.js',
                    'gruntfile.js',
                    '<%= meta.jsSourcePath %>*.js',
                    '<%= meta.cssSourceSassPath %>*.scss'
                ],
                tasks: ['bump:patch']
            },
            js: {
                files: [
                    'gruntfile.js',
                    '<%= meta.jsSourcePath %>*.js'
                ],
                tasks: [
                    'concat:concatBeanStackJs',
                    'uglify:compressBeanStackJs'
                ]
            },
            css: {
                files: [
                    '<%= meta.cssSourceSassPath %>*.scss',
                    '!.sass-cache/**',
                    '!node_modules/**'
                ],
                tasks: [
                    'compass',
                    'cssmin:minifyVendorCss',
                    'cssmin:minifyBeanStackCss',
                    'concat:concatVendorCss',
                    'concat:concatBeanStackCss'
                ]
            }
        }

    });

    grunt.registerTask('default', 'Compiles all files and watches.',
        [
            'compass',
            'cssmin',
            'uglify',
            'concat',
            'bump',
            'watch'
        ]
    );
    grunt.registerTask('css',
        [
            'cssmin:minifyVendorCss',
            'cssmin:minifyBeanStackCss',
            'concat:concatVendorCss',
            'concat:concatBeanStackCss'
        ]);
    grunt.registerTask('js',
        [
            'uglify:compressVendorJs',
            'uglify:compressBeanStackJs',
            'concat:concatVendorJs',
            'concat:concatBeanStackJs'
        ]);
    grunt.registerTask('install', 'Cleans build folders, compiles all assets and copies to appropriate vendor destination, preparing for development.',
        [
            'clean:build',
            'bower',
            //'shell',
            'bowercopy',
            'compass',
            'cssmin',
            'uglify',
            'concat'
        ]
    );
};
