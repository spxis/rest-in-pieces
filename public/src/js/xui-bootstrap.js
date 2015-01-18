/*!
 * xPatterns Applications Visual Style Guide applied to Bootstrap 3 with SASS
 * Version 1.1.1 built 2014-09-18
 * Based on enhancements to bootstrap-sass-twbs version 3.2.0+2
 * Copyright 2014 Atigeo LLC
*/
/*=============================================================================
// Atigeo xUI Library: xUI.Color class
//
// Requires:
// - None
// Provides: 
// - xUI.Color
//-----------------------------------------------------------------------------
// DEPENDENCIES: There are no dependencies for this library, but the colors
// 				should be the same as those defined in the xUI.Color.css
//				stylesheet.
//-----------------------------------------------------------------------------
// USAGE: 
//
// myColor = xUI.Color.brand.orange;
//
//-----------------------------------------------------------------------------
// 2012-01-25 JRM - Created.
// 2012-04-27 JRM - Added additional colors.
// 2014-06-30 JRM - Updated for xui-bootstrap bower project.
//===========================================================================*/

if (!xUI) { var xUI = {}; }

xUI.Color = {
    brand: {
        orange: '#ff8a02',
        gray: '#636466',
        grey: '#636466',
        lightGray: '#eaeaea',
        lightGrey: '#eaeaea',
        white: '#fff'
    },

    text: {
        mainBody: '#636466',
        hyperlink: '#ff8a02',
        subBody: '#eaeaea'
    },

    basic: {
        orange1: '#ff8a02',
        yellowOrange2: '#ffc402',
        green3: '#5daf51',
        blue4: '#35659f',
        gray5: '#686868',
        grey5: '#686868'
    },

    gradients: {
        orange: {
            start: '#ffba02',
            mid: '#ffba02',
            end: '#fbc383'
        }
    },

    status: {
        regular: '#686868',
        positive: '#5daf51',
        warning: '#ffc402',
        negative: '#e50007',
        error: '#e50007'
    }
};